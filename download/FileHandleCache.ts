import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

interface HandleEntry {
  promise: Promise<FileHandle>;
  handle?: FileHandle;
  inFlight: number;
  lastUsed: number;
}

/**
 * Small LRU-ish cache for random-access writes.
 *
 * SteamPipe chunks are not guaranteed to arrive in file order. Keeping a bounded
 * set of FileHandles avoids open/close per chunk while still staying friendly to
 * ulimit defaults when a depot contains many files.
 */
export class FileHandleCache {
  private readonly entries = new Map<string, HandleEntry>();
  private entrySlotLock: Promise<void> = Promise.resolve();

  constructor(private readonly maxOpenHandles = 64) {}

  async write(filePath: string, data: Buffer, position: number): Promise<void> {
    const entry = await this.acquire(filePath);

    try {
      const handle = await entry.promise;
      let written = 0;

      while (written < data.length) {
        const { bytesWritten } = await handle.write(data, written, data.length - written, position + written);
        if (bytesWritten <= 0) 
          throw new Error(`Failed to write chunk data to ${filePath}: write made no progress after ${written} of ${data.length} bytes`);
        
        written += bytesWritten;
      }
    } finally {
      entry.inFlight--;
      entry.lastUsed = Date.now();
      await this.evictIdleHandles();
    }
  }

  async closePath(filePath: string): Promise<void> {
    let entry: HandleEntry | undefined;

    await this.withEntrySlotLock(async () => {
      entry = this.entries.get(filePath);
      if (!entry) return;

      await this.waitForIdle(entry);

      if (this.entries.get(filePath) === entry) 
        this.entries.delete(filePath);
      
    });

    if (!entry) return;

    const handle = await entry.promise.catch(() => undefined);
    await handle?.close().catch(() => undefined);
  }

  async closeAll(): Promise<void> {
    let entries: Array<[string, HandleEntry]> = [];

    await this.withEntrySlotLock(async () => {
      entries = [...this.entries.entries()];

      for (const [filePath, entry] of entries) {
        await this.waitForIdle(entry);

        if (this.entries.get(filePath) === entry) 
          this.entries.delete(filePath);
        
      }
    });

    await Promise.all(entries.map(async ([, entry]) => {
      const handle = await entry.promise.catch(() => undefined);
      await handle?.close().catch(() => undefined);
    }));
  }

  private async waitForIdle(entry: HandleEntry): Promise<void> {
    while (entry.inFlight > 0) 
      await new Promise(resolve => setTimeout(resolve, 0));
    
  }

  private async acquire(filePath: string): Promise<HandleEntry> {
    let acquired: HandleEntry | undefined;

    await this.withEntrySlotLock(async () => {
      let entry = this.entries.get(filePath);

      if (!entry) {
        await this.waitForEntrySlot();
        entry = {
          promise: open(filePath, constants.O_RDWR | NOFOLLOW),
          inFlight: 0,
          lastUsed: Date.now()
        };
        entry.promise.then(handle => {
          entry!.handle = handle;
          return handle;
        }).catch(() => undefined);
        this.entries.set(filePath, entry);
      }

      entry.inFlight++;
      entry.lastUsed = Date.now();
      acquired = entry;
    });

    if (!acquired) 
      throw new Error(`Failed to acquire file handle for ${filePath}`);
    

    return acquired;
  }

  private async withEntrySlotLock(fn: () => Promise<void>): Promise<void> {
    const previous = this.entrySlotLock;
    let release!: () => void;
    this.entrySlotLock = new Promise(resolve => { release = resolve; });

    await previous;
    try {
      await fn();
    } finally {
      release();
    }
  }

  private async waitForEntrySlot(): Promise<void> {
    const max = Math.max(1, Math.floor(this.maxOpenHandles));

    while (this.entries.size >= max) {
      if (await this.evictOneIdleHandle()) continue;
      await this.waitForAnyIdleHandle();
    }
  }

  private async waitForAnyIdleHandle(): Promise<void> {
    while ([...this.entries.values()].every(entry => entry.inFlight > 0)) 
      await new Promise(resolve => setTimeout(resolve, 0));
    
  }

  private async evictIdleHandles(): Promise<void> {
    await this.withEntrySlotLock(async () => {
      const max = Math.max(1, Math.floor(this.maxOpenHandles));
      while (this.entries.size > max && await this.evictOneIdleHandle()) {
        // keep evicting until the cache is back under the configured cap or all entries are busy
      }
    });
  }

  private async evictOneIdleHandle(): Promise<boolean> {
    const candidate = [...this.entries.entries()]
      .filter(([, entry]) => entry.inFlight === 0)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)[0];

    if (!candidate) return false;

    const [filePath, entry] = candidate;
    this.entries.delete(filePath);
    const handle = await entry.promise.catch(() => undefined);
    await handle?.close().catch(() => undefined);
    return true;
  }
}

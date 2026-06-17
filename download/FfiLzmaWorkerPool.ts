import { decompressLzmaAloneWithFfi, resolveFfiLzmaLibraryPath, resolveFfiLzmaWorkerCount } from './FfiLzma.js';
import { normalizeConcurrency } from './concurrency.js';

interface PendingJob {
  payload: Buffer;
  decompressedSize: number;
  resolve: (value: Buffer) => void;
  reject: (error: Error) => void;
}

interface InFlightJob {
  resolve: (value: Buffer) => void;
  reject: (error: Error) => void;
}

export interface FfiLzmaWorkerPoolOptions {
  workers?: number;
  libraryPath?: string;
  memlimitBytes?: number;
  debug?: (message: string) => void;
  useWorkers?: boolean;
}

export class FfiLzmaWorkerPool {
  private readonly workers: FfiLzmaWorker[] = [];
  private readonly libraryPath: string | null;
  private cursor = 0;

  constructor(private readonly options: FfiLzmaWorkerPoolOptions = {}) {
    this.libraryPath = resolveFfiLzmaLibraryPath(options.libraryPath);
    if (!this.libraryPath) 
      throw new Error('ffi-liblzma backend was requested, but native libsteam_lzma was not found. Run `bun run build:native:lzma` or set STEAM_FFI_LZMA_LIBRARY_PATH.');
    

    const desiredWorkers = resolveFfiLzmaWorkerCount(options.workers);
    const useWorkers = options.useWorkers ?? true;

    if (useWorkers && typeof Worker === 'undefined') 
      throw new Error('ffi-liblzma worker backend was requested, but Worker is not available in this runtime.');
    

    if (useWorkers && typeof Worker !== 'undefined') {
      const workerCount = normalizeConcurrency(desiredWorkers, 'ffi-liblzma worker count');
      this.workers = Array.from({ length: workerCount }, (_, index) => (
        new FfiLzmaWorker({
          index,
          libraryPath: this.libraryPath!,
          memlimitBytes: options.memlimitBytes,
          debug: options.debug
        })
      ));
    }
  }

  decompress(payload: Buffer, decompressedSize: number): Promise<Buffer> {
    if (this.workers.length === 0) {
      return Promise.resolve(decompressLzmaAloneWithFfi(payload, decompressedSize, {
        libraryPath: this.libraryPath!,
        memlimitBytes: this.options.memlimitBytes
      }));
    }

    const worker = this.nextWorker();
    return worker.decompress(payload, decompressedSize);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map(worker => worker.close()));
  }

  private nextWorker(): FfiLzmaWorker {
    let best = this.workers[this.cursor++ % this.workers.length]!;
    for (const worker of this.workers) 
      if (worker.pendingCount < best.pendingCount) best = worker;
    
    return best;
  }
}

interface FfiLzmaWorkerOptions {
  index: number;
  libraryPath: string;
  memlimitBytes?: number;
  debug?: (message: string) => void;
}

class FfiLzmaWorker {
  private readonly worker: Worker;
  private readonly pending = new Map<number, InFlightJob>();
  private readonly queue: PendingJob[] = [];
  private active = false;
  private nextId = 1;
  private closed = false;

  constructor(private readonly options: FfiLzmaWorkerOptions) {
    this.worker = new Worker(new URL('./FfiLzmaWorker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = event => this.handleMessage(event as MessageEvent<WorkerResponseMessage>);
    this.worker.onerror = event => {
      const maybe = event as unknown as { message?: unknown };
      const message = typeof maybe.message === 'string' ? maybe.message : 'ffi-liblzma worker error';
      this.failWorker(new Error(message));
    };
  }

  get pendingCount(): number {
    return this.pending.size + this.queue.length + (this.active ? 1 : 0);
  }

  decompress(payload: Buffer, decompressedSize: number): Promise<Buffer> {
    if (this.closed) 
      return Promise.reject(new Error('ffi-liblzma worker has been closed'));
    

    return new Promise((resolve, reject) => {
      this.queue.push({ payload, decompressedSize, resolve, reject });
      void this.pump();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) job.reject(new Error('ffi-liblzma worker was closed'));
    for (const [, job] of this.pending) job.reject(new Error('ffi-liblzma worker was closed'));
    this.pending.clear();
    this.worker.terminate();
  }

  private async pump(): Promise<void> {
    if (this.active) return;
    this.active = true;

    try {
      while (!this.closed && this.queue.length > 0) {
        const job = this.queue.shift()!;
        await this.send(job);
      }
    } finally {
      this.active = false;
      if (this.queue.length > 0 && !this.closed) void this.pump();
    }
  }

  private send(job: PendingJob): Promise<void> {
    return new Promise(resolve => {
      if (this.closed) {
        job.reject(new Error('ffi-liblzma worker has been closed'));
        resolve();
        return;
      }

      const id = this.nextId++;
      this.pending.set(id, {
        resolve: value => {
          job.resolve(value);
          resolve();
        },
        reject: error => {
          job.reject(error);
          resolve();
        }
      });

      try {
        const payload = job.payload.buffer.slice(job.payload.byteOffset, job.payload.byteOffset + job.payload.byteLength) as ArrayBuffer;
        this.worker.postMessage({
          id,
          payload,
          decompressedSize: job.decompressedSize,
          libraryPath: this.options.libraryPath,
          memlimitBytes: this.options.memlimitBytes
        }, [payload]);
      } catch (error) {
        this.pending.delete(id);
        job.reject(error instanceof Error ? error : new Error(String(error)));
        resolve();
      }
    });
  }

  private handleMessage(event: MessageEvent<WorkerResponseMessage>): void {
    const message = event.data;

    if ('ready' in message) {
      this.options.debug?.(`[ffi-liblzma:${this.options.index}] ready ${message.libraryPath ?? '(no library found)'}`);
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);

    if ('error' in message) {
      const error = new Error(message.error.message);
      if (message.error.stack) error.stack = message.error.stack;
      pending.reject(error);
      return;
    }

    pending.resolve(Buffer.from(message.result));
  }

  private failWorker(error: Error): void {
    this.options.debug?.(`[ffi-liblzma:${this.options.index}] ${error.message}`);
    this.closed = true;
    try { this.worker.terminate(); } catch { /* noop */ }
    for (const job of this.queue.splice(0)) job.reject(error);
    for (const [, job] of this.pending) job.reject(error);
    this.pending.clear();
  }
}

type WorkerResponseMessage =
  | { ready: true; libraryPath: string | null }
  | { id: number; result: ArrayBuffer }
  | { id: number; error: { message: string; stack?: string } };

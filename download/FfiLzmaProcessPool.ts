import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FFI_LZMA_MEMLIMIT_BYTES, resolveFfiLzmaLibraryPath, resolveFfiLzmaMemlimitBytes, resolveFfiLzmaWorkerCount } from './FfiLzma.js';
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


function normalizeNonNegativeInteger(value: number, name: string): number {
  if (!Number.isFinite(value)) 
    throw new RangeError(`${name} must be a finite number`);
  

  const integer = Math.floor(value);
  if (integer < 0) 
    throw new RangeError(`${name} must be at least 0`);
  

  return integer;
}

export interface FfiLzmaProcessPoolOptions {
  workers?: number;
  libraryPath?: string;
  memlimitBytes?: number;
  bunExecutable?: string;
  maxRetries?: number;
  debug?: (message: string) => void;
}

/**
 * Runs the fast liblzma FFI shim in separate Bun child processes.
 *
 * Bun worker threads + bun:ffi have shown nondeterministic crashes under heavy
 * concurrent LZMA load. A process pool keeps the speed of the C shim but turns a
 * native/FFI crash into a retryable worker failure instead of a main-process
 * segfault.
 */
export class FfiLzmaProcessPool {
  private readonly workers: FfiLzmaProcessWorker[];
  private readonly maxRetries: number;
  private cursor = 0;

  constructor(private readonly options: FfiLzmaProcessPoolOptions = {}) {
    const libraryPath = resolveFfiLzmaLibraryPath(options.libraryPath);
    if (!libraryPath) 
      throw new Error('ffi-liblzma backend was requested, but native libsteam_lzma was not found. Run `bun run build:native:lzma` or set STEAM_FFI_LZMA_LIBRARY_PATH.');
    

    const desiredWorkers = resolveFfiLzmaWorkerCount(options.workers);
    const bunExecutable = resolveBunExecutable(options.bunExecutable);
    const workerPath = resolveProcessWorkerPath();
    this.maxRetries = normalizeNonNegativeInteger(options.maxRetries ?? Number(process.env.STEAM_FFI_LZMA_PROCESS_RETRIES ?? 2), 'ffi-liblzma process retry count');

    const memlimitBytes = Number(resolveFfiLzmaMemlimitBytes(options.memlimitBytes));

    const workerCount = normalizeConcurrency(desiredWorkers, 'ffi-liblzma process worker count');
    this.workers = Array.from({ length: workerCount }, (_, index) => new FfiLzmaProcessWorker({
      index,
      bunExecutable,
      workerPath,
      libraryPath,
      memlimitBytes,
      debug: options.debug
    }));
  }

  async decompress(payload: Buffer, decompressedSize: number): Promise<Buffer> {
    let lastError: Error | undefined;
    const attempts = Math.max(1, this.maxRetries + 1);

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const worker = this.nextWorker();
      try {
        return await worker.decompress(payload, decompressedSize);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.options.debug?.(`[ffi-liblzma-process] attempt ${attempt}/${attempts} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('ffi-liblzma-process failed');
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map(worker => worker.close()));
  }

  private nextWorker(): FfiLzmaProcessWorker {
    let best = this.workers[this.cursor++ % this.workers.length]!;
    for (const worker of this.workers) 
      if (worker.pendingCount < best.pendingCount) best = worker;
    
    return best;
  }
}

interface FfiLzmaProcessWorkerOptions {
  index: number;
  bunExecutable: string;
  workerPath: string;
  libraryPath: string;
  memlimitBytes?: number;
  debug?: (message: string) => void;
}

class FfiLzmaProcessWorker {
  private child?: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, InFlightJob>();
  private readonly queue: PendingJob[] = [];
  private active = false;
  private nextId = 1;
  private stdoutBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private closed = false;
  private restarting = false;

  constructor(private readonly options: FfiLzmaProcessWorkerOptions) {}

  get pendingCount(): number {
    return this.pending.size + this.queue.length + (this.active ? 1 : 0);
  }

  decompress(payload: Buffer, decompressedSize: number): Promise<Buffer> {
    if (this.closed) 
      return Promise.reject(new Error('ffi-liblzma process worker has been closed'));
    

    return new Promise((resolve, reject) => {
      this.queue.push({ payload, decompressedSize, resolve, reject });
      void this.pump();
    });
  }

  async close(): Promise<void> {
    this.closed = true;

    for (const job of this.queue.splice(0)) job.reject(new Error('ffi-liblzma process worker was closed'));
    for (const [, job] of this.pending) job.reject(new Error('ffi-liblzma process worker was closed'));
    this.pending.clear();

    const child = this.child;
    if (!child || child.killed) return;

    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1_000);

      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      child.stdin.end();
    });
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
    return new Promise((resolve) => {
      const child = this.ensureChild();
      if (!child.stdin.writable) {
        const error = new Error('ffi-liblzma process worker stdin is not writable');
        job.reject(error);
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

      const header = Buffer.allocUnsafe(12);
      header.writeUInt32LE(id, 0);
      header.writeUInt32LE(job.decompressedSize, 4);
      header.writeUInt32LE(job.payload.byteLength, 8);

      const failWrite = (error: Error): void => {
        this.pending.delete(id);
        job.reject(error);
        resolve();
      };

      const writePayload = (): void => {
        child.stdin.write(job.payload, error => {
          if (error) failWrite(error);
        });
      };

      const headerAccepted = child.stdin.write(header, error => {
        if (error) failWrite(error);
      });
      if (!headerAccepted) {
        child.stdin.once('drain', writePayload);
        return;
      }

      writePayload();
    });
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed && this.child.exitCode === null) return this.child;

    this.stdoutBuffer = Buffer.alloc(0);
    const child = spawn(this.options.bunExecutable, [this.options.workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...withDefinedEnv({
          STEAM_FFI_LZMA_LIBRARY_PATH: this.options.libraryPath,
          STEAM_FFI_LZMA_MEMLIMIT_BYTES: String(this.options.memlimitBytes ?? DEFAULT_FFI_LZMA_MEMLIMIT_BYTES)
        })
      }
    });

    this.child = child;
    this.restarting = false;

    child.stdout.on('data', chunk => this.handleStdout(Buffer.from(chunk)));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => this.options.debug?.(`[ffi-liblzma-process:${this.options.index}] ${chunk.trimEnd()}`));
    child.once('error', error => this.failProcess(error));
    child.once('exit', (code, signal) => {
      if (!this.closed) 
        this.failProcess(new Error(`ffi-liblzma process exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`));
      
    });

    return child;
  }

  private handleStdout(chunk: Buffer<ArrayBufferLike>): void {
    this.stdoutBuffer = this.stdoutBuffer.length === 0 ? chunk : Buffer.concat([this.stdoutBuffer, chunk]) as Buffer<ArrayBufferLike>;

    while (true) {
      if (this.stdoutBuffer.length < 12) return;

      const id = this.stdoutBuffer.readUInt32LE(0);
      const status = this.stdoutBuffer.readUInt32LE(4);
      const payloadLength = this.stdoutBuffer.readUInt32LE(8);
      const frameLength = 12 + payloadLength;

      if (payloadLength > 512 * 1024 * 1024) {
        this.failProcess(new Error(`ffi-liblzma process returned absurd payload length ${payloadLength}`));
        return;
      }

      if (this.stdoutBuffer.length < frameLength) return;

      const payload = this.stdoutBuffer.subarray(12, frameLength);
      this.stdoutBuffer = this.stdoutBuffer.subarray(frameLength);

      const pending = this.pending.get(id);
      if (!pending) continue;
      this.pending.delete(id);

      if (status === 0) 
        pending.resolve(Buffer.from(payload) as Buffer);
       else 
        pending.reject(new Error(payload.toString('utf8')));
      
    }
  }

  private failProcess(error: Error): void {
    this.options.debug?.(`[ffi-liblzma-process:${this.options.index}] ${error.message}`);

    const child = this.child;
    this.child = undefined;
    this.stdoutBuffer = Buffer.alloc(0);

    if (child && !child.killed) 
      try { child.kill('SIGKILL'); } catch { /* noop */ }
    

    for (const [, job] of this.pending) job.reject(error);
    this.pending.clear();

    // Leave queued jobs in the queue; their callers will retry through the pool if
    // the current process died. Restarting immediately here can create fork storms.
    if (!this.closed && this.queue.length > 0 && !this.restarting) {
      this.restarting = true;
      setTimeout(() => {
        this.restarting = false;
        void this.pump();
      }, 25).unref?.();
    }
  }
}

function resolveBunExecutable(configured?: string): string {
  const explicit = configured || process.env.STEAM_BUN_EXECUTABLE;
  if (explicit) return explicit;

  if (isBunRuntime()) return process.execPath;

  throw new Error('ffi-liblzma-process requires a Bun executable because its worker uses bun:ffi. Run under Bun, or set STEAM_BUN_EXECUTABLE to a Bun binary. Auto mode skips this backend under Node.');
}

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
}

function resolveProcessWorkerPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, 'FfiLzmaProcessWorker.js'),
    path.join(here, 'FfiLzmaProcessWorker.ts')
  ];

  for (const candidate of candidates) 
    if (existsSync(candidate)) return candidate;
  

  // Prefer the JS path in error messages / built packages.
  return candidates[0]!;
}

function withDefinedEnv(values: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) 
    if (value !== undefined && value !== '') result[key] = value;
  
  return result;
}

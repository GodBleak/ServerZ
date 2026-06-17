import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import { normalizeConcurrency } from './concurrency.js';

const require = createRequire(import.meta.url);

interface PendingJob {
  payload: Buffer;
  resolve: (value: Buffer) => void;
  reject: (error: Error) => void;
}

interface InFlightJob {
  resolve: (value: Buffer) => void;
  reject: (error: Error) => void;
}

export interface NodeLzmaWorkerPoolOptions {
  workers?: number;
  nodeExecutable?: string;
  debug?: (message: string) => void;
  lzmaNativeRequirePath?: string;
}

/**
 * Runs lzma-native in child Node.js processes instead of inside Bun.
 *
 * lzma-native is fast for Steam VZip chunks, but loading/calling the native addon
 * in Bun 1.3.x can segfault under concurrency. A child-process pool keeps Bun as
 * the main runtime while isolating the native addon behind a JSON-lines protocol.
 */
export class NodeLzmaWorkerPool {
  private readonly workers: NodeLzmaWorker[];
  private cursor = 0;

  constructor(options: NodeLzmaWorkerPoolOptions = {}) {
    const desiredWorkers = options.workers ?? Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2)));
    const nodeExecutable = options.nodeExecutable ?? process.env.STEAM_NODE_EXECUTABLE ?? 'node';
    const lzmaNativeRequirePath = options.lzmaNativeRequirePath ?? resolveOptionalModule('lzma-native');

    const workerCount = normalizeConcurrency(desiredWorkers, 'node-lzma worker count');
    this.workers = Array.from({ length: workerCount }, (_, index) => (
      new NodeLzmaWorker({ index, nodeExecutable, debug: options.debug, lzmaNativeRequirePath })
    ));
  }

  decompress(payload: Buffer): Promise<Buffer> {
    const worker = this.nextWorker();
    return worker.decompress(payload);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map(worker => worker.close()));
  }

  private nextWorker(): NodeLzmaWorker {
    // Prefer the least-loaded worker, but rotate first so equal loads distribute.
    let best = this.workers[this.cursor++ % this.workers.length]!;

    for (const worker of this.workers) 
      if (worker.pendingCount < best.pendingCount) best = worker;
    

    return best;
  }
}

interface NodeLzmaWorkerOptions {
  index: number;
  nodeExecutable: string;
  debug?: (message: string) => void;
  lzmaNativeRequirePath?: string;
}

class NodeLzmaWorker {
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<void>;
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  private readonly pending = new Map<number, InFlightJob>();
  private readonly queue: PendingJob[] = [];
  private active = false;
  private nextId = 1;
  private stdoutBuffer = '';
  private closed = false;

  constructor(private readonly options: NodeLzmaWorkerOptions) {}

  get pendingCount(): number {
    return this.pending.size + this.queue.length + (this.active ? 1 : 0);
  }

  decompress(payload: Buffer): Promise<Buffer> {
    if (this.closed) 
      return Promise.reject(new Error('Node LZMA worker has been closed'));
    

    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
      void this.pump();
    });
  }

  async close(): Promise<void> {
    this.closed = true;

    for (const job of this.queue.splice(0)) 
      job.reject(new Error('Node LZMA worker was closed'));
    

    for (const [, job] of this.pending) 
      job.reject(new Error('Node LZMA worker was closed'));
    
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
      await this.ensureReady();

      while (!this.closed && this.queue.length > 0) {
        const job = this.queue.shift()!;
        await this.send(job);
      }
    } catch (error) {
      const normalizedError = toError(error);

      for (const job of this.queue.splice(0)) 
        job.reject(normalizedError);
      

      for (const [, job] of this.pending) 
        job.reject(normalizedError);
      
      this.pending.clear();
    } finally {
      this.active = false;
      if (this.queue.length > 0 && !this.closed) void this.pump();
    }
  }

  private ensureReady(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    const child = spawn(this.options.nodeExecutable, ['-e', WORKER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        STEAM_LZMA_NATIVE_REQUIRE_PATH: this.options.lzmaNativeRequirePath ?? ''
      }
    });

    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => this.handleStdout(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => this.options.debug?.(`[node-lzma:${this.options.index}] ${chunk.trimEnd()}`));

    child.once('error', error => this.failWorker(error));
    child.once('exit', (code, signal) => {
      if (!this.closed) 
        this.failWorker(new Error(`node-lzma worker exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`));
      
    });

    return this.ready;
  }

  private send(job: PendingJob): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = this.child;
      if (!child || child.killed || !child.stdin.writable) {
        const error = new Error('node-lzma worker is not writable');
        job.reject(error);
        reject(error);
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

      const line = JSON.stringify({ id, payload: job.payload.toString('base64') }) + '\n';
      child.stdin.write(line, error => {
        if (!error) return;
        this.pending.delete(id);
        job.reject(error);
        reject(error);
      });
    });
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline === -1) break;

      const line = this.stdoutBuffer.slice(0, newline);
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line.trim()) continue;

      let message: WorkerMessage;
      try {
        message = JSON.parse(line) as WorkerMessage;
      } catch  {
        this.options.debug?.(`[node-lzma:${this.options.index}] invalid JSON from worker: ${line}`);
        continue;
      }

      if ('ready' in message) {
        if (message.ready) 
          this.readyResolve?.();
         else 
          this.readyReject?.(new Error(message.error ?? 'node-lzma worker failed to initialize'));
        
        continue;
      }

      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);

      if (message.error) {
        const error = new Error(message.error.message);
        Object.assign(error, message.error);
        pending.reject(error);
      } else if (message.result) {
        pending.resolve(Buffer.from(message.result, 'base64'));
      } else {
        pending.reject(new Error('node-lzma worker returned no result'));
      }
    }
  }

  private failWorker(error: Error): void {
    this.readyReject?.(error);

    for (const job of this.queue.splice(0)) job.reject(error);
    for (const [, job] of this.pending) job.reject(error);
    this.pending.clear();
  }
}



function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function resolveOptionalModule(packageName: string): string | undefined {
  try {
    return require.resolve(packageName);
  } catch {
    return undefined;
  }
}

type WorkerMessage =
  | { ready: true }
  | { ready: false; error: string }
  | { id: number; result?: string; error?: { message: string; code?: unknown; desc?: unknown; stack?: string } };

const WORKER_SCRIPT = String.raw`
const lzma = (() => {
  try {
    return require(process.env.STEAM_LZMA_NATIVE_REQUIRE_PATH || 'lzma-native');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ready: false, error: error && error.message ? error.message : String(error) }) + '\n');
    process.exit(1);
  }
})();

if (typeof lzma.decompress !== 'function') {
  process.stdout.write(JSON.stringify({ ready: false, error: 'lzma-native does not expose decompress()' }) + '\n');
  process.exit(1);
}

process.stdout.write(JSON.stringify({ ready: true }) + '\n');
process.stdin.setEncoding('utf8');
let buffer = '';
let running = false;
const queue = [];

process.stdin.on('data', chunk => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline === -1) break;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    queue.push(JSON.parse(line));
  }
  pump();
});

function pump() {
  if (running) return;
  const msg = queue.shift();
  if (!msg) return;
  running = true;

  const payload = Buffer.from(msg.payload, 'base64');
  lzma.decompress(payload, (result, err) => {
    if (err) {
      process.stdout.write(JSON.stringify({ id: msg.id, error: serializeError(err) }) + '\n');
    } else {
      process.stdout.write(JSON.stringify({ id: msg.id, result: Buffer.from(result).toString('base64') }) + '\n');
    }
    running = false;
    pump();
  });
}

function serializeError(error) {
  return {
    message: error && error.message ? error.message : String(error),
    code: error && error.code,
    desc: error && error.desc,
    stack: error && error.stack
  };
}
`;

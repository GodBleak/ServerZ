import { inflateRawSync } from 'node:zlib';
import { FfiLzmaWorkerPool } from './FfiLzmaWorkerPool.js';
import { FfiLzmaProcessPool } from './FfiLzmaProcessPool.js';
import { resolveFfiLzmaMemlimitBytes } from './FfiLzma.js';


export type SteamCdnCompressionType = 'zip' | 'zstd' | 'vzip' | 'unknown';
export type SteamCdnCompressionBackend =
  | 'zlib'
  | 'adm-zip'
  | 'zstddec'
  | 'mongodb-zstd'
  | 'zig-wasm'
  | 'ffi-liblzma'
  | 'ffi-liblzma-process'
  | 'ffi-liblzma-worker'
  | 'lzma-native'
  | 'lzma'
  | 'steam-user';

export type BunCdnCompressionMode = 'auto' | 'steam-user';
export type BunCdnZstdBackend = 'auto' | 'zstddec' | 'mongodb-zstd' | 'steam-user';
export type BunCdnLzmaBackend = 'auto' | 'ffi-liblzma' | 'ffi-liblzma-process' | 'ffi-liblzma-worker' | 'zig-wasm' | 'lzma-native' | 'lzma' | 'steam-user';

export interface SteamCdnCompressionOptions {
  /** auto uses fast ZIP/zlib and explicit Zstd/LZMA decoders; steam-user delegates every chunk to steam-user's helper. */
  mode?: BunCdnCompressionMode;
  /** auto prefers @mongodb-js/zstd when installed, otherwise zstddec. */
  zstdBackend?: BunCdnZstdBackend;
  /** auto prefers process-isolated ffi-liblzma when running under Bun or when a Bun executable is configured, then safe pure-JS lzma. */
  lzmaBackend?: BunCdnLzmaBackend;
  /** Bun executable used by the process-isolated ffi-liblzma backend. Also configurable with STEAM_BUN_EXECUTABLE. */
  ffiLzmaBunExecutable?: string;
  /** Process/worker count for ffi-liblzma. Defaults to 3x detected logical CPU count, capped at 64. Also configurable with STEAM_FFI_LZMA_WORKERS. */
  ffiLzmaWorkers?: number;
  /** Retry count for process-isolated ffi-liblzma jobs after child-process crashes. Default 2. */
  ffiLzmaProcessRetries?: number;
  /** Optional native shim path for ffi-liblzma. Also configurable with STEAM_FFI_LZMA_LIBRARY_PATH. */
  ffiLzmaLibraryPath?: string;
  /** liblzma memory limit, in bytes. Defaults to 8 GiB. */
  ffiLzmaMemlimitBytes?: number;
  /** If false, skip wrapped-chunk size/CRC checks. Default true. */
  verify?: boolean;
  /** Optional scoped worker-pool context. Use this for downloads that should not share global FFI workers. */
  context?: SteamCdnCompressionContext;
  /** Called once per decompressed chunk. Useful for profiling compression type/backend distribution. */
  onResult?: (result: SteamCdnCompressionResult) => void;
  debug?: (message: string) => void;
}

export interface SteamCdnCompressionResult {
  type: SteamCdnCompressionType;
  backend: SteamCdnCompressionBackend;
  compressedBytes: number;
  decompressedBytes: number;
  durationMs: number;
  fallback: boolean;
}

let cachedZstddecDecoder: Promise<{ decode(data: Buffer | Uint8Array, size: number): Uint8Array }> | undefined;
let cachedMongodbZstd: Promise<{ decompress(data: Buffer): Promise<Buffer> } | null> | undefined;
let cachedZigWasmCompress: Promise<{ decompressLzma(data: Uint8Array): Promise<Uint8Array> } | null> | undefined;
export class SteamCdnCompressionContext {
  private ffiLzmaProcessPools = new Map<string, FfiLzmaProcessPool>();
  private ffiLzmaWorkerPools = new Map<string, FfiLzmaWorkerPool>();

  getFfiLzmaProcessPool(options: SteamCdnCompressionOptions): FfiLzmaProcessPool {
    const key = ffiLzmaProcessPoolKey(options);
    let pool = this.ffiLzmaProcessPools.get(key);
    if (!pool) {
      pool = new FfiLzmaProcessPool({
        workers: options.ffiLzmaWorkers,
        libraryPath: options.ffiLzmaLibraryPath,
        memlimitBytes: options.ffiLzmaMemlimitBytes,
        maxRetries: options.ffiLzmaProcessRetries,
        bunExecutable: options.ffiLzmaBunExecutable,
        debug: options.debug
      });
      this.ffiLzmaProcessPools.set(key, pool);
    }
    return pool;
  }

  getFfiLzmaWorkerPool(options: SteamCdnCompressionOptions): FfiLzmaWorkerPool {
    const key = ffiLzmaWorkerPoolKey(options);
    let pool = this.ffiLzmaWorkerPools.get(key);
    if (!pool) {
      pool = new FfiLzmaWorkerPool({
        workers: options.ffiLzmaWorkers,
        libraryPath: options.ffiLzmaLibraryPath,
        memlimitBytes: options.ffiLzmaMemlimitBytes,
        debug: options.debug
      });
      this.ffiLzmaWorkerPools.set(key, pool);
    }
    return pool;
  }

  async close(): Promise<void> {
    const ffiProcessPools = this.ffiLzmaProcessPools;
    const ffiWorkerPools = this.ffiLzmaWorkerPools;
    this.ffiLzmaProcessPools = new Map();
    this.ffiLzmaWorkerPools = new Map();
    await Promise.all([
      ...[...ffiProcessPools.values()].map(pool => pool.close()),
      ...[...ffiWorkerPools.values()].map(pool => pool.close())
    ]);
  }
}

const globalCompressionContext = new SteamCdnCompressionContext();


export async function closeSteamCdnCompressionWorkers(): Promise<void> {
  await globalCompressionContext.close();
}

export async function decompressSteamCdnChunk(data: Buffer, options: SteamCdnCompressionOptions = {}): Promise<Buffer> {
  const startedAt = performanceNow();
  const type = detectCompressionType(data);
  let backend: SteamCdnCompressionBackend = 'steam-user';
  let fallback = false;

  let result: Buffer;

  if (options.mode === 'steam-user') {
    result = await decompressWithSteamUserHelper(data);
    backend = steamUserBackendName(type);
  } else if (type === 'zip') {
    try {
      result = decompressZipSingleEntryWithZlib(data);
      backend = 'zlib';
    } catch (error) {
      fallback = true;
      backend = 'adm-zip';
      options.debug?.(`ZIP fast path fell back to adm-zip: ${error instanceof Error ? error.message : String(error)}`);
      result = await decompressZipWithAdmZip(data);
    }
  } else if (type === 'zstd') {
    ({ result, backend, fallback } = await decompressZstd(data, options));
  } else if (type === 'vzip') {
    ({ result, backend, fallback } = await decompressVzip(data, options));
  } else {
    fallback = true;
    backend = 'steam-user';
    result = await decompressWithSteamUserHelper(data);
  }

  options.onResult?.({
    type,
    backend,
    compressedBytes: data.length,
    decompressedBytes: result.length,
    durationMs: performanceNow() - startedAt,
    fallback
  });

  return result;
}

export function detectCompressionType(data: Buffer): SteamCdnCompressionType {
  const header = data.subarray(0, 4).toString('utf8');
  if (header.startsWith('PK\u0003\u0004')) return 'zip';
  if (header.startsWith('VSZa')) return 'zstd';
  if (header.startsWith('VZa')) return 'vzip';
  return 'unknown';
}

function steamUserBackendName(_type: SteamCdnCompressionType): SteamCdnCompressionBackend {
  return 'steam-user';
}

function decompressZipSingleEntryWithZlib(data: Buffer): Buffer {
  if (data.length < 30 || data.readUInt32LE(0) !== 0x04034b50) 
    throw new Error('Invalid ZIP local file header');
  

  const flags = data.readUInt16LE(6);
  const method = data.readUInt16LE(8);
  const compressedSize = data.readUInt32LE(18);
  const uncompressedSize = data.readUInt32LE(22);
  const fileNameLength = data.readUInt16LE(26);
  const extraLength = data.readUInt16LE(28);

  if ((flags & 0x08) !== 0) 
    throw new Error('ZIP data descriptor chunks need the fallback ZIP parser');
  

  const payloadOffset = 30 + fileNameLength + extraLength;
  const payloadEnd = payloadOffset + compressedSize;
  if (payloadOffset < 30 || payloadEnd > data.length) 
    throw new Error('ZIP payload extends beyond chunk buffer');
  

  const payload = data.subarray(payloadOffset, payloadEnd);
  let result: Buffer;

  if (method === 0) 
    result = Buffer.from(payload);
   else if (method === 8) 
    result = inflateRawSync(payload);
   else 
    throw new Error(`Unsupported ZIP compression method ${method}`);
  

  if (result.length !== uncompressedSize) 
    throw new Error(`ZIP chunk size mismatch: expected ${uncompressedSize}, got ${result.length}`);
  

  return result;
}

async function decompressZstd(data: Buffer, options: SteamCdnCompressionOptions): Promise<{ result: Buffer; backend: SteamCdnCompressionBackend; fallback: boolean }> {
  const parsed = parseZstdChunk(data);
  const requested = options.zstdBackend ?? 'auto';

  if (requested === 'steam-user') 
    return { result: await decompressWithSteamUserHelper(data), backend: 'steam-user', fallback: false };
  

  if (requested === 'auto' || requested === 'mongodb-zstd') {
    const mongodbZstd = await loadMongodbZstd();
    if (mongodbZstd) {
      const result = Buffer.from(await mongodbZstd.decompress(parsed.compressed));
      if (options.verify ?? true) verifyParsedChunk('Zstd', result, parsed.decompressedSize, parsed.decompressedCrc);
      return { result, backend: 'mongodb-zstd', fallback: false };
    }

    if (requested === 'mongodb-zstd') 
      throw new Error('@mongodb-js/zstd was requested but is not installed/usable');
    
  }

  if (requested === 'auto' || requested === 'zstddec') {
    const decoder = await loadZstddecDecoder();
    const result = Buffer.from(decoder.decode(parsed.compressed, parsed.decompressedSize));
    if (options.verify ?? true) verifyParsedChunk('Zstd', result, parsed.decompressedSize, parsed.decompressedCrc);
    return { result, backend: 'zstddec', fallback: false };
  }

  return { result: await decompressWithSteamUserHelper(data), backend: 'steam-user', fallback: true };
}

async function decompressVzip(data: Buffer, options: SteamCdnCompressionOptions): Promise<{ result: Buffer; backend: SteamCdnCompressionBackend; fallback: boolean }> {
  const parsed = parseVzipChunk(data);
  const payload = createLzmaAlonePayload(parsed.properties, parsed.compressed, parsed.decompressedSize);
  const requested = options.lzmaBackend ?? 'auto';

  // Important: do not use steam-user's compression helper for VZip in auto mode.
  // It requireWithFallback('lzma-native', 'lzma') at module load, so if lzma-native
  // is installed, just requiring the helper can put Bun on the crashing native path.
  const canUseFfiProcess = canUseFfiLzmaProcessBackend(options);
  if ((requested === 'auto' && canUseFfiProcess) || requested === 'ffi-liblzma' || requested === 'ffi-liblzma-process') {
    try {
      const result = await getFfiLzmaProcessPool(options).decompress(payload, parsed.decompressedSize);
      if (options.verify ?? true) verifyParsedChunk('VZip', result, parsed.decompressedSize, parsed.decompressedCrc);
      return { result, backend: 'ffi-liblzma-process', fallback: false };
    } catch (error) {
      if (requested === 'ffi-liblzma' || requested === 'ffi-liblzma-process') 
        throw error;
      
      options.debug?.(`ffi-liblzma-process failed for VZip chunk; falling back to pure-JS lzma: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (requested === 'auto') {
    options.debug?.('ffi-liblzma-process skipped for VZip chunks because the current runtime is not Bun and no Bun executable was configured; falling back to pure-JS lzma.');
  }

  // Unsafe but useful for reproducing/benchmarking Bun Worker + bun:ffi behavior.
  // Do not use as the default under Bun; process isolation is much more reliable.
  if (requested === 'ffi-liblzma-worker') {
    const result = await getFfiLzmaWorkerPool(options).decompress(payload, parsed.decompressedSize);
    if (options.verify ?? true) verifyParsedChunk('VZip', result, parsed.decompressedSize, parsed.decompressedCrc);
    return { result, backend: 'ffi-liblzma-worker', fallback: false };
  }


  if (requested === 'zig-wasm') {
    const zigWasm = await loadZigWasmCompress();
    if (!zigWasm) 
      throw new Error('@zig-wasm/compress was requested but is not installed/usable');
    

    const result = Buffer.from(await zigWasm.decompressLzma(payload));
    if (options.verify ?? true) verifyParsedChunk('VZip', result, parsed.decompressedSize, parsed.decompressedCrc);
    return { result, backend: 'zig-wasm', fallback: false };
  }

  // lzma-native is deliberately explicit-only and in-process. It is unsafe under
  // Bun 1.3.x in our testing, so prefer ffi-liblzma-process if you want native speed.
  if (requested === 'lzma-native') {
    const lzmaNative = await loadOptionalLzma('lzma-native');
    if (!lzmaNative) 
      throw new Error('lzma-native was requested but is not installed/usable');
    

    const result = await runSerializedNativeLzma(() => decompressWithLzmaModule(lzmaNative, payload));
    if (options.verify ?? true) verifyParsedChunk('VZip', result, parsed.decompressedSize, parsed.decompressedCrc);
    return { result, backend: 'lzma-native', fallback: false };
  }

  if (requested === 'steam-user') 
    return { result: await decompressWithSteamUserHelper(data), backend: 'steam-user', fallback: false };
  

  // Safe compatibility fallback. Slow, but it won't load the native addon into Bun.
  const lzma = await loadOptionalLzma('lzma');
  if (!lzma) 
    throw new Error('No safe VZip decoder is available. Install lzma, or build the ffi-liblzma native shim.');
  

  const result = await decompressWithLzmaModule(lzma, payload);
  if (options.verify ?? true) verifyParsedChunk('VZip', result, parsed.decompressedSize, parsed.decompressedCrc);
  return { result, backend: 'lzma', fallback: requested === 'auto' };
}

function parseZstdChunk(data: Buffer): ParsedWrappedChunk {
  if (data.subarray(0, 4).toString('utf8') !== 'VSZa') 
    throw new Error("Zstd: didn't see expected header");
  
  if (data.subarray(data.length - 3).toString('utf8') !== 'zsv') 
    throw new Error("Zstd: didn't see expected footer");
  

  return {
    compressed: data.subarray(8, data.length - 15),
    decompressedCrc: data.readUInt32LE(data.length - 15),
    decompressedSize: data.readUInt32LE(data.length - 11)
  };
}

function parseVzipChunk(data: Buffer): ParsedWrappedChunk & { properties: Buffer } {
  if (data.subarray(0, 3).toString('utf8') !== 'VZa') 
    throw new Error("VZip: didn't see expected header");
  
  if (data.subarray(data.length - 2).toString('utf8') !== 'zv') 
    throw new Error("VZip: didn't see expected footer");
  

  return {
    properties: data.subarray(7, 12),
    compressed: data.subarray(12, data.length - 10),
    decompressedCrc: data.readUInt32LE(data.length - 10),
    decompressedSize: data.readUInt32LE(data.length - 6)
  };
}

interface ParsedWrappedChunk {
  compressed: Buffer;
  decompressedCrc: number;
  decompressedSize: number;
}

function createLzmaAlonePayload(properties: Buffer, compressed: Buffer, decompressedSize: number): Buffer {
  const size = Buffer.allocUnsafe(8);
  size.writeUInt32LE(decompressedSize >>> 0, 0);
  size.writeUInt32LE(0, 4);
  return Buffer.concat([properties, size, compressed]);
}

function verifyParsedChunk(name: string, result: Buffer, expectedSize: number, expectedCrc: number): void {
  if (result.length !== expectedSize) 
    throw new Error(`${name}: decompressed size was not valid`);
  

  if (crc32(result) !== expectedCrc) 
    throw new Error(`${name}: CRC check failed on decompressed data`);
  
}


async function decompressZipWithAdmZip(data: Buffer): Promise<Buffer> {
  const loaded = await importRequiredModule('adm-zip');
  const AdmZip = getDefaultExport(loaded) as new (data: Buffer) => { getEntries(): Array<unknown>; readFile(entry: unknown): Buffer | null };
  const unzip = new AdmZip(data);
  const firstEntry = unzip.getEntries()[0];
  if (!firstEntry) throw new Error('ZIP fallback found no entries');
  const result = unzip.readFile(firstEntry);
  if (!result) throw new Error('ZIP fallback could not read first entry');
  return Buffer.from(result);
}

async function decompressWithSteamUserHelper(data: Buffer): Promise<Buffer> {
  const loaded = await importRequiredModule('steam-user/components/cdn_compression.js');
  const helper = getDefaultExport(loaded) as { unzip(data: Buffer): Promise<Buffer> };
  return helper.unzip(data);
}

function getFfiLzmaProcessPool(options: SteamCdnCompressionOptions): FfiLzmaProcessPool {
  return (options.context ?? globalCompressionContext).getFfiLzmaProcessPool(options);
}

function canUseFfiLzmaProcessBackend(options: SteamCdnCompressionOptions): boolean {
  return isBunRuntime() || Boolean(options.ffiLzmaBunExecutable || process.env.STEAM_BUN_EXECUTABLE);
}

function getFfiLzmaWorkerPool(options: SteamCdnCompressionOptions): FfiLzmaWorkerPool {
  return (options.context ?? globalCompressionContext).getFfiLzmaWorkerPool(options);
}

function ffiLzmaProcessPoolKey(options: SteamCdnCompressionOptions): string {
  return JSON.stringify({
    kind: 'process',
    workers: options.ffiLzmaWorkers ?? null,
    libraryPath: options.ffiLzmaLibraryPath ?? process.env.STEAM_FFI_LZMA_LIBRARY_PATH ?? null,
    memlimitBytes: resolveFfiLzmaMemlimitBytes(options.ffiLzmaMemlimitBytes).toString(),
    maxRetries: options.ffiLzmaProcessRetries ?? process.env.STEAM_FFI_LZMA_PROCESS_RETRIES ?? null,
    bunExecutable: options.ffiLzmaBunExecutable ?? process.env.STEAM_BUN_EXECUTABLE ?? (isBunRuntime() ? process.execPath : null)
  });
}

function ffiLzmaWorkerPoolKey(options: SteamCdnCompressionOptions): string {
  return JSON.stringify({
    kind: 'worker',
    workers: options.ffiLzmaWorkers ?? null,
    libraryPath: options.ffiLzmaLibraryPath ?? process.env.STEAM_FFI_LZMA_LIBRARY_PATH ?? null,
    memlimitBytes: resolveFfiLzmaMemlimitBytes(options.ffiLzmaMemlimitBytes).toString()
  });
}


async function loadZigWasmCompress(): Promise<{ decompressLzma(data: Uint8Array): Promise<Uint8Array> } | null> {
  if (!cachedZigWasmCompress) {
    cachedZigWasmCompress = import('@zig-wasm/compress')
      .then(loaded => {
        const maybe = loaded as { decompressLzma?: (data: Uint8Array) => Promise<Uint8Array> | Uint8Array };
        if (typeof maybe.decompressLzma !== 'function') return null;

        return {
          decompressLzma: async (data: Uint8Array) => Buffer.from(await maybe.decompressLzma!(data))
        };
      })
      .catch(() => null);
  }

  return cachedZigWasmCompress;
}

async function loadMongodbZstd(): Promise<{ decompress(data: Buffer): Promise<Buffer> } | null> {
  if (!cachedMongodbZstd) {
    cachedMongodbZstd = importOptionalModule('@mongodb-js/zstd').then(loaded => {
      if (!loaded) return null;
      const mod = getDefaultExport(loaded) as { decompress?: (data: Buffer) => Promise<Buffer> };
      if (typeof mod.decompress !== 'function') return null;
      return { decompress: mod.decompress };
    });
  }

  return cachedMongodbZstd;
}

async function loadZstddecDecoder(): Promise<{ decode(data: Buffer | Uint8Array, size: number): Uint8Array }> {
  if (!cachedZstddecDecoder) {
    cachedZstddecDecoder = Promise.resolve().then(async () => {
      const loaded = await importRequiredModule('zstddec');
      const mod = getDefaultExport(loaded) as { ZSTDDecoder?: new () => { init(): Promise<void>; decode(data: Buffer | Uint8Array, size: number): Uint8Array } };
      const ZSTDDecoder = mod.ZSTDDecoder;
      if (!ZSTDDecoder) throw new Error('zstddec did not expose ZSTDDecoder');
      const decoder = new ZSTDDecoder();
      await decoder.init();
      return decoder;
    });
  }

  return cachedZstddecDecoder;
}


let nativeLzmaQueue: Promise<void> = Promise.resolve();

function runSerializedNativeLzma<T>(fn: () => Promise<T>): Promise<T> {
  const run = nativeLzmaQueue.then(fn, fn);
  nativeLzmaQueue = run.then(() => undefined, () => undefined);
  return run;
}

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
}

async function loadOptionalLzma(packageName: 'lzma-native' | 'lzma'): Promise<unknown> {
  const loaded = await importOptionalModule(packageName);
  return loaded ? getDefaultExport(loaded) : null;
}

async function importRequiredModule(specifier: string): Promise<unknown> {
  try {
    return await import(specifier);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to import ${specifier}: ${message}`);
  }
}

async function importOptionalModule(specifier: string): Promise<unknown> {
  try {
    return await import(specifier);
  } catch {
    return null;
  }
}

function getDefaultExport(module: unknown): unknown {
  const maybe = module as { default?: unknown };
  return maybe.default ?? module;
}

function decompressWithLzmaModule(module: unknown, payload: Buffer): Promise<Buffer> {
  const lzma = module as { decompress?: (data: Buffer, callback: (...args: unknown[]) => void) => void };
  if (typeof lzma.decompress !== 'function') 
    throw new Error('Selected LZMA module does not expose decompress()');
  

  return new Promise((resolve, reject) => {
    lzma.decompress!(payload, (...args: unknown[]) => {
      const [first, second] = args;

      if (first instanceof Error) {
        reject(first);
        return;
      }

      if (second instanceof Error) {
        reject(second);
        return;
      }

      const result = first ?? second;
      if (!result) {
        reject(new Error('LZMA decompressor returned no data'));
        return;
      }

      resolve(Buffer.from(result as Uint8Array));
    });
  });
}

let crcTable: Uint32Array | undefined;

function crc32(data: Buffer): number {
  const table = crcTable ??= createCrc32Table();
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i++) 
    crc = table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) 
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    
    table[i] = c >>> 0;
  }

  return table;
}

function performanceNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

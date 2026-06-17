import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { constants } from 'node:fs';
import { chmod, mkdir, open, rename, stat, symlink, unlink, writeFile, readFile, readlink, lstat } from 'node:fs/promises';
import path from 'node:path';

const bun = (globalThis as typeof globalThis & {
  Bun?: {
    file(path: string): { exists(): Promise<boolean>; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> };
    write(path: string, contents: string | Uint8Array | ArrayBuffer): Promise<number>;
  };
}).Bun;

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

function isFilesystemRoot(resolvedPath: string): boolean {
  return path.parse(resolvedPath).root === resolvedPath;
}

function assertOutputRootIsNotFilesystemRoot(root: string): void {
  if (isFilesystemRoot(root)) 
    throw new Error('Refusing to use the filesystem root as an output directory; choose a dedicated install directory instead.');
  
}

export class UnsafeSymlinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeSymlinkError';
  }
}

function assertInsideRoot(rootDirectory: string, targetPath: string): { root: string; target: string } {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(targetPath);

  assertOutputRootIsNotFilesystemRoot(root);

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) 
    throw new Error(`Refusing to access path outside output directory: ${targetPath}`);
  

  return { root, target };
}

export async function ensureDirNoSymlinks(rootDirectory: string, directory: string): Promise<void> {
  const { root, target } = assertInsideRoot(rootDirectory, directory);
  await mkdir(root, { recursive: true });

  const relative = path.relative(root, target);
  if (!relative || relative === '.') return;

  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);

    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) 
        throw new UnsafeSymlinkError(`Refusing to follow symlink inside output directory: ${current}`);
      

      if (!stats.isDirectory()) 
        throw new Error(`Expected directory inside output directory: ${current}`);
      
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') 
        throw error;
      

      await mkdir(current);
    }
  }
}

export async function removeFileIfSymlink(filePath: string): Promise<boolean> {
  try {
    const stats = await lstat(filePath);
    if (!stats.isSymbolicLink()) return false;
    await unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function assertRegularFileNoSymlink(rootDirectory: string, filePath: string, options?: { followDirectorySymlinks?: boolean }): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  assertInsideRoot(rootDirectory, filePath);
  if (!options?.followDirectorySymlinks) 
    await ensureDirNoSymlinks(rootDirectory, path.dirname(filePath));
  

  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) 
      throw new UnsafeSymlinkError(`Refusing to follow symlink inside output directory: ${filePath}`);
    

    if (!stats.isFile()) 
      throw new Error(`Expected regular file inside output directory: ${filePath}`);
    

    return stats;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function fileSizeNoFollow(rootDirectory: string, filePath: string): Promise<number | null> {
  const stats = await assertRegularFileNoSymlink(rootDirectory, filePath);
  if (!stats) return null;

  if (typeof stats.size === 'bigint') {
    const size = Number(stats.size);
    if (!Number.isSafeInteger(size)) 
      throw new Error(`File is too large to represent safely as a number: ${filePath}`);
    
    return size;
  }

  return stats.size;
}

export async function readSymlinkNoFollow(rootDirectory: string, filePath: string): Promise<string | null> {
  assertInsideRoot(rootDirectory, filePath);

  try {
    const stats = await lstat(filePath);
    if (!stats.isSymbolicLink()) return null;
    return readlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function sha1FileNoFollow(rootDirectory: string, filePath: string): Promise<string> {
  await assertRegularFileNoSymlink(rootDirectory, filePath);
  const handle = await open(filePath, constants.O_RDONLY | NOFOLLOW);

  try {
    const hash = createHash('sha1');
    const buffer = Buffer.allocUnsafe(1024 * 1024);

    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }

    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

export async function prepareOutputFilePath(rootDirectory: string, filePath: string): Promise<void> {
  assertInsideRoot(rootDirectory, filePath);
  await ensureDirNoSymlinks(rootDirectory, path.dirname(filePath));
  await removeFileIfSymlink(filePath);
}

export async function prepareSteamCmdOutputFilePath(rootDirectory: string, filePath: string): Promise<void> {
  assertInsideRoot(rootDirectory, filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await removeFileIfSymlink(filePath);
}

export async function ensureDir(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

export async function pathExists(filePath: string): Promise<boolean> {
  if (bun) 
    return bun.file(filePath).exists();
  

  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') 
      return false;
    

    throw error;
  }
}

export async function fileSize(filePath: string): Promise<number | null> {
  try {
    return (await stat(filePath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') 
      return null;
    

    throw error;
  }
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  if (!(await pathExists(filePath))) 
    return null;
  

  const text = bun ? await bun.file(filePath).text() : await readFile(filePath, 'utf8');
  try {
    return JSON.parse(text) as T;
  } catch {
    // Corrupt or malformed JSON — treat as missing/empty.
    return null;
  }
}

export const DEFAULT_FILE_MODE = 0o644;

export async function writeJson(filePath: string, value: unknown, options: { mode?: number; strictMode?: boolean; rootDirectory?: string } = {}): Promise<void> {
  if (options.rootDirectory) 
    await prepareOutputFilePath(options.rootDirectory, filePath);
   else 
    await ensureDir(path.dirname(filePath));
  

  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  const mode = options.mode ?? DEFAULT_FILE_MODE;
  let completed = false;

  try {
    const handle = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, mode);
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync().catch(() => undefined);
    } finally {
      await handle.close();
    }

    if (options.mode !== undefined) {
      const chmodError = await chmod(temporaryPath, options.mode).then(() => undefined, error => error);
      if (chmodError && options.strictMode) throw chmodError;
    }

    await rename(temporaryPath, filePath);
    completed = true;
  } finally {
    if (!completed) await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function writeBytes(filePath: string, data: Uint8Array | ArrayBuffer, options: { rootDirectory?: string } = {}): Promise<void> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (options.rootDirectory) {
    await prepareOutputFilePath(options.rootDirectory, filePath);
    const handle = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | NOFOLLOW, DEFAULT_FILE_MODE);
    try {
      let written = 0;
      while (written < bytes.length) {
        const { bytesWritten } = await handle.write(bytes, written, bytes.length - written, written);
        if (bytesWritten <= 0) 
          throw new Error(`Failed to write bytes to ${filePath}: write made no progress after ${written} of ${bytes.length} bytes`);
        
        written += bytesWritten;
      }
    } finally {
      await handle.close();
    }
    return;
  }

  await ensureDir(path.dirname(filePath));

  if (bun) 
    await bun.write(filePath, bytes);
   else 
    await writeFile(filePath, bytes);
  
}

export async function writeSteamCmdBytes(filePath: string, data: Uint8Array | ArrayBuffer, options: { rootDirectory: string }): Promise<void> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  await prepareSteamCmdOutputFilePath(options.rootDirectory, filePath);

  const handle = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | NOFOLLOW, DEFAULT_FILE_MODE);
  try {
    let written = 0;
    while (written < bytes.length) {
      const { bytesWritten } = await handle.write(bytes, written, bytes.length - written, written);
      if (bytesWritten <= 0) 
        throw new Error(`Failed to write bytes to ${filePath}: write made no progress after ${written} of ${bytes.length} bytes`);
      
      written += bytesWritten;
    }
  } finally {
    await handle.close();
  }
}

export async function chmodNoFollow(rootDirectory: string, filePath: string, mode: number, options?: { followDirectorySymlinks?: boolean }): Promise<void> {
  await assertRegularFileNoSymlink(rootDirectory, filePath, options);
  const handle = await open(filePath, constants.O_RDONLY | NOFOLLOW);
  try {
    await handle.chmod(mode);
  } finally {
    await handle.close();
  }
}

export async function isElfExecutableNoFollow(rootDirectory: string, filePath: string, options?: { followDirectorySymlinks?: boolean }): Promise<boolean> {
  await assertRegularFileNoSymlink(rootDirectory, filePath, options);
  const handle = await open(filePath, constants.O_RDONLY | NOFOLLOW);
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 20 || header[0] !== 0x7f || header[1] !== 0x45 || header[2] !== 0x4c || header[3] !== 0x46) 
      return false;
    

    const elfClass = header[4];
    const endian = header[5];
    const littleEndian = endian === 1;
    if ((elfClass !== 1 && elfClass !== 2) || (endian !== 1 && endian !== 2)) return false;

    const readUInt16 = (offset: number): number => littleEndian ? header.readUInt16LE(offset) : header.readUInt16BE(offset);
    const readUInt32 = (buffer: Buffer, offset: number): number => littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
    const readUInt64 = (offset: number): number => {
      const value = littleEndian ? header.readBigUInt64LE(offset) : header.readBigUInt64BE(offset);
      return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.MAX_SAFE_INTEGER;
    };

    const eType = readUInt16(16);
    if (eType === 2) return true; // ET_EXEC
    if (eType !== 3) return false; // ET_DYN: shared object or PIE executable

    const programHeaderOffset = elfClass === 1 ? readUInt32(header, 28) : readUInt64(32);
    const programHeaderEntrySize = elfClass === 1 ? readUInt16(42) : readUInt16(54);
    const programHeaderCount = elfClass === 1 ? readUInt16(44) : readUInt16(56);
    if (!programHeaderOffset || !programHeaderEntrySize || !programHeaderCount || programHeaderCount > 1024) return false;

    const entry = Buffer.alloc(programHeaderEntrySize);
    for (let index = 0; index < programHeaderCount; index++) {
      const offset = programHeaderOffset + index * programHeaderEntrySize;
      const result = await handle.read(entry, 0, programHeaderEntrySize, offset);
      if (result.bytesRead < 4) break;
      if (readUInt32(entry, 0) === 3) return true; // PT_INTERP: PIE executable, not a plain .so
    }

    return false;
  } finally {
    await handle.close();
  }
}

export async function createSymlinkNoFollow(rootDirectory: string, linkPath: string, linkTarget: string): Promise<void> {
  if (!linkTarget) 
    throw new Error(`Refusing to create symlink with empty target: ${linkPath}`);
  

  const { root, target } = assertInsideRoot(rootDirectory, linkPath);
  await ensureDirNoSymlinks(rootDirectory, path.dirname(target));

  const resolvedTarget = path.resolve(path.isAbsolute(linkTarget) ? linkTarget : path.resolve(path.dirname(target), linkTarget));
  if (resolvedTarget !== root && !resolvedTarget.startsWith(`${root}${path.sep}`)) 
    throw new Error(`Refusing to create symlink outside output directory: ${linkPath} -> ${linkTarget}`);
  

  await removeFileIfSymlink(target);
  try {
    const stats = await lstat(target);
    if (!stats.isFile()) 
      throw new Error(`Refusing to replace non-file symlink path: ${target}`);
    
    await unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await symlink(linkTarget, target);
}

export async function writeByteStream(filePath: string, stream: ReadableStream<Uint8Array>, options: { rootDirectory: string }): Promise<number> {
  await prepareOutputFilePath(options.rootDirectory, filePath);

  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  let completed = false;
  let totalBytes = 0;
  const handle = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, DEFAULT_FILE_MODE);

  try {
    let position = 0;

    for await (const chunk of stream) {
      let written = 0;
      while (written < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, written, chunk.length - written, position + written);
        if (bytesWritten <= 0) 
          throw new Error(`Failed to write bytes to ${temporaryPath}: write made no progress after ${written} of ${chunk.length} bytes in current chunk`);
        
        written += bytesWritten;
      }

      position += chunk.length;
      totalBytes += chunk.length;
    }

    await handle.close();
    await rename(temporaryPath, filePath);
    completed = true;
    return totalBytes;
  } finally {
    await handle.close().catch(() => undefined);
    if (!completed) 
      await unlink(temporaryPath).catch(() => undefined);
    
  }
}

export async function createSparseFile(filePath: string, size: number, options: { rootDirectory?: string } = {}): Promise<void> {
  if (options.rootDirectory) 
    await prepareOutputFilePath(options.rootDirectory, filePath);
   else 
    await ensureDir(path.dirname(filePath));
  

  const handle = await open(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | NOFOLLOW, DEFAULT_FILE_MODE);
  try {
    await handle.truncate(size);
  } finally {
    await handle.close();
  }
}

export async function createSteamCmdSparseFile(filePath: string, size: number, options: { rootDirectory: string }): Promise<void> {
  await prepareSteamCmdOutputFilePath(options.rootDirectory, filePath);

  const handle = await open(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | NOFOLLOW, DEFAULT_FILE_MODE);
  try {
    await handle.truncate(size);
  } finally {
    await handle.close();
  }
}

export async function removeFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') 
      return;
    

    throw error;
  }
}

export async function removeFileNoFollow(rootDirectory: string, filePath: string): Promise<void> {
  assertInsideRoot(rootDirectory, filePath);

  try {
    const stats = await lstat(filePath);
    if (stats.isDirectory()) 
      throw new Error(`Refusing to remove directory as file: ${filePath}`);
    

    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') 
      return;
    

    throw error;
  }
}

export async function sha1File(filePath: string): Promise<string> {
  if (bun) {
    const hasherCtor = (bun as unknown as { CryptoHasher?: new (algorithm: string) => { update(data: Uint8Array): void; digest(encoding: 'hex'): string } }).CryptoHasher;
    if (hasherCtor) {
      const hasher = new hasherCtor('sha1');
      hasher.update(new Uint8Array(await bun.file(filePath).arrayBuffer()));
      return hasher.digest('hex');
    }
  }

  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function safeJoin(rootDirectory: string, depotFilename: string): string {
  const normalizedDepotPath = depotFilename.replace(/\\/g, '/').replace(/^\/+/, '');
  const root = path.resolve(rootDirectory);
  const target = path.resolve(root, normalizedDepotPath);

  assertOutputRootIsNotFilesystemRoot(root);

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) 
    throw new Error(`Refusing to write outside output directory: ${depotFilename}`);
  

  return target;
}

export function toNumber(value: string | number | bigint | undefined, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length > 0) return Number(value);
  return fallback;
}

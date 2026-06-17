import { decompressLzmaAloneWithFfi, resolveFfiLzmaLibraryPath, resolveFfiLzmaMemlimitBytes } from './FfiLzma.js';

type PendingFrame = {
  id: number;
  decompressedSize: number;
  payloadLength: number;
  payload: Buffer;
};

const libraryPath = process.env.STEAM_FFI_LZMA_LIBRARY_PATH || resolveFfiLzmaLibraryPath() || undefined;
const memlimitBytes = resolveFfiLzmaMemlimitBytes(process.env.STEAM_FFI_LZMA_MEMLIMIT_BYTES);

let input = Buffer.alloc(0);
let closed = false;
let pumping = false;

process.stdin.on('data', chunk => {
  input = input.length === 0 ? Buffer.from(chunk) : Buffer.concat([input, Buffer.from(chunk)]);
  void pump();
});

process.stdin.on('end', () => {
  closed = true;
  if (input.length === 0) 
    void exitAfterStdoutFlush();
  
});

process.stdin.resume();

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;

  try {
    while (true) {
      const frame = readFrame();
      if (!frame) {
        if (closed && input.length === 0) 
          await exitAfterStdoutFlush();
        
        return;
      }
      await handleFrame(frame);
    }
  } finally {
    pumping = false;
  }
}

function readFrame(): PendingFrame | null {
  if (input.length < 12) return null;

  const id = input.readUInt32LE(0);
  const decompressedSize = input.readUInt32LE(4);
  const payloadLength = input.readUInt32LE(8);
  const totalLength = 12 + payloadLength;

  if (payloadLength > 512 * 1024 * 1024) {
    void writeError(id, `Refusing absurd LZMA payload length ${payloadLength}`);
    input = Buffer.alloc(0);
    return null;
  }

  if (input.length < totalLength) return null;

  const payload = input.subarray(12, totalLength);
  input = input.subarray(totalLength);

  return { id, decompressedSize, payloadLength, payload };
}

async function handleFrame(frame: PendingFrame): Promise<void> {
  try {
    const result = decompressLzmaAloneWithFfi(frame.payload, frame.decompressedSize, {
      libraryPath,
      memlimitBytes
    });

    await writeResult(frame.id, result);
  } catch (error) {
    await writeError(frame.id, error instanceof Error ? error.message : String(error));
  }
}

async function writeResult(id: number, result: Buffer): Promise<void> {
  const header = Buffer.allocUnsafe(12);
  header.writeUInt32LE(id, 0);
  header.writeUInt32LE(0, 4);
  header.writeUInt32LE(result.byteLength, 8);
  await writeStdout(header);
  await writeStdout(result);
}

async function writeError(id: number, message: string): Promise<void> {
  const payload = Buffer.from(message, 'utf8');
  const header = Buffer.allocUnsafe(12);
  header.writeUInt32LE(id, 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(payload.byteLength, 8);
  await writeStdout(header);
  await writeStdout(payload);
}

function writeStdout(data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(data, error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function exitAfterStdoutFlush(): Promise<void> {
  return new Promise(resolve => {
    process.stdout.write('', () => {
      resolve();
      process.exit(0);
    });
  });
}

process.on('uncaughtException', error => {
  try {
    process.stderr.write(`[ffi-liblzma-process] uncaught exception: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  } finally {
    process.exit(1);
  }
});

process.on('unhandledRejection', error => {
  try {
    process.stderr.write(`[ffi-liblzma-process] unhandled rejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  } finally {
    process.exit(1);
  }
});

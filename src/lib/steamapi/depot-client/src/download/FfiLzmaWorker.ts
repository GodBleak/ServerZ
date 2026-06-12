import { decompressLzmaAloneWithFfi, resolveFfiLzmaLibraryPath } from './FfiLzma.js';

type RequestMessage = {
  id: number;
  payload: ArrayBuffer;
  decompressedSize: number;
  libraryPath?: string;
  memlimitBytes?: number;
};

type ResponseMessage =
  | { ready: true; libraryPath: string | null }
  | { id: number; result: ArrayBuffer }
  | { id: number; error: { message: string; stack?: string } };

type WorkerMessageEvent<T> = { data: T };

type BunWorkerGlobal = {
  postMessage(message: ResponseMessage, transfer?: ArrayBuffer[]): void;
  onmessage: ((event: WorkerMessageEvent<RequestMessage>) => void) | null;
};

const scope = globalThis as unknown as BunWorkerGlobal;

scope.postMessage({ ready: true, libraryPath: resolveFfiLzmaLibraryPath() });

scope.onmessage = (event: WorkerMessageEvent<RequestMessage>) => {
  const message = event.data;

  try {
    const payload = Buffer.from(message.payload);
    const result = decompressLzmaAloneWithFfi(payload, message.decompressedSize, {
      libraryPath: message.libraryPath,
      memlimitBytes: message.memlimitBytes
    });

    const out = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
    scope.postMessage({ id: message.id, result: out }, [out]);
  } catch (error) {
    scope.postMessage({
      id: message.id,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
};

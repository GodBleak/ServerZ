declare module '@zig-wasm/compress' {
  export function decompress(data: Uint8Array, algorithm?: string): Promise<Uint8Array>
}

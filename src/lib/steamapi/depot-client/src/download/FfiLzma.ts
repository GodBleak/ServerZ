import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export interface FfiLzmaOptions {
  libraryPath?: string
  memlimitBytes?: number | bigint
}

export interface FfiLzmaBinding {
  libraryPath: string
  decompressAlone(payload: Buffer, decompressedSize: number): Buffer
}

type BunFfiModule = {
  dlopen(path: string, symbols: Record<string, unknown>): { symbols: Record<string, (...args: unknown[]) => unknown>; close?: () => void }
  FFIType: Record<string, unknown>
  ptr(data: Uint8Array): unknown
  suffix?: string
}

const require = createRequire(import.meta.url)

export const DEFAULT_FFI_LZMA_MEMLIMIT_BYTES = 8 * 1024 * 1024 * 1024
export const MAX_DEFAULT_FFI_LZMA_WORKERS = 64

export function resolveFfiLzmaWorkerCount(value?: number | string | null): number {
  const raw = value ?? process.env.STEAM_FFI_LZMA_WORKERS

  if (raw !== undefined && raw !== null && raw !== "") {
    const workers = Number(raw)
    if (!Number.isFinite(workers)) throw new RangeError(`ffi-liblzma worker count must be a finite number; received ${String(raw)}`)

    const normalized = Math.floor(workers)
    if (normalized < 1) throw new RangeError(`ffi-liblzma worker count must be at least 1; received ${String(raw)}`)

    return normalized
  }

  const logicalCores = Math.max(1, os.availableParallelism?.() ?? os.cpus().length ?? 1)
  return Math.min(MAX_DEFAULT_FFI_LZMA_WORKERS, Math.max(1, logicalCores * 3))
}

export function resolveFfiLzmaMemlimitBytes(value?: number | bigint | string | null): bigint {
  const raw = value ?? process.env.STEAM_FFI_LZMA_MEMLIMIT_BYTES

  if (raw === undefined || raw === null || raw === "") return BigInt(DEFAULT_FFI_LZMA_MEMLIMIT_BYTES)

  const memlimit = typeof raw === "bigint" ? raw : BigInt(raw)
  if (memlimit <= 0n) throw new Error(`ffi-liblzma memlimit must be greater than zero; received ${memlimit.toString()} bytes`)

  return memlimit
}

const cachedBindings = new Map<string, FfiLzmaBinding>()

export function loadFfiLzma(options: FfiLzmaOptions = {}): FfiLzmaBinding | null {
  const libraryPath = resolveFfiLzmaLibraryPath(options.libraryPath)
  if (!libraryPath) return null

  const key = `${libraryPath}\0${resolveFfiLzmaMemlimitBytes(options.memlimitBytes).toString()}`
  const cached = cachedBindings.get(key)
  if (cached) return cached

  const binding = createBinding(libraryPath, options)
  cachedBindings.set(key, binding)
  return binding
}

export function decompressLzmaAloneWithFfi(payload: Buffer, decompressedSize: number, options: FfiLzmaOptions = {}): Buffer {
  const binding = loadFfiLzma(options)
  if (!binding)
    {throw new Error(
      "ffi-liblzma backend was requested, but native libsteam_lzma was not found. Run `bun run build:native:lzma` or set STEAM_FFI_LZMA_LIBRARY_PATH."
    )}

  return binding.decompressAlone(payload, decompressedSize)
}

export function resolveFfiLzmaLibraryPath(explicitPath?: string): string | null {
  const candidates = candidateLibraryPaths(explicitPath)
  for (const candidate of candidates) if (candidate && existsSync(candidate)) return candidate

  return null
}

function createBinding(libraryPath: string, options: FfiLzmaOptions): FfiLzmaBinding {
  const ffi = loadBunFfi()
  const dlopen = ffi.dlopen.bind(ffi)
  const FFIType = ffi.FFIType
  const ptr = ffi.ptr.bind(ffi)

  const library = dlopen(libraryPath, {
    steam_lzma_decompress_alone: {
      args: [FFIType.ptr, FFIType.usize, FFIType.ptr, FFIType.usize, FFIType.u64, FFIType.ptr],
      returns: FFIType.i32,
    },
    steam_lzma_error_name: {
      args: [FFIType.i32],
      returns: FFIType.cstring,
    },
    steam_lzma_abi_version: {
      args: [],
      returns: FFIType.u32,
    },
  })

  const decompressSymbol = library.symbols.steam_lzma_decompress_alone
  const errorNameSymbol = library.symbols.steam_lzma_error_name
  const abiVersionSymbol = library.symbols.steam_lzma_abi_version

  if (typeof decompressSymbol !== "function") throw new Error("Native libsteam_lzma is missing symbol steam_lzma_decompress_alone")

  if (typeof errorNameSymbol !== "function") throw new Error("Native libsteam_lzma is missing symbol steam_lzma_error_name")

  if (typeof abiVersionSymbol !== "function") throw new Error("Native libsteam_lzma is missing symbol steam_lzma_abi_version")

  const abiVersion = Number(abiVersionSymbol())
  if (abiVersion !== 1) throw new Error(`Unsupported steam_lzma ABI version ${abiVersion}; expected 1`)

  const memlimit = resolveFfiLzmaMemlimitBytes(options.memlimitBytes)

  return {
    libraryPath,
    decompressAlone(payload: Buffer, decompressedSize: number): Buffer {
      const output = Buffer.allocUnsafe(decompressedSize)
      const written = Buffer.alloc(8)

      const code = Number(decompressSymbol(ptr(payload), payload.byteLength, ptr(output), output.byteLength, memlimit, ptr(written)))

      const writtenBytes = Number(written.readBigUInt64LE(0))
      if (code !== 0) {
        const errorName = String(errorNameSymbol(code))
        const hint =
          errorName === "LZMA_MEMLIMIT_ERROR"
            ? `; memlimit=${memlimit.toString()} bytes; increase STEAM_FFI_LZMA_MEMLIMIT_BYTES or bunCdnFfiLzmaMemlimitBytes`
            : ""
        throw new Error(`ffi-liblzma failed with ${errorName} (${code})${hint}`)
      }

      if (writtenBytes !== decompressedSize) throw new Error(`ffi-liblzma output size mismatch: expected ${decompressedSize}, got ${writtenBytes}`)

      return output
    },
  }
}

function loadBunFfi(): BunFfiModule {
  if (typeof (globalThis as { Bun?: unknown }).Bun === "undefined") throw new Error("ffi-liblzma backend requires Bun because it uses bun:ffi")

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("bun:ffi") as BunFfiModule
}

function candidateLibraryPaths(explicitPath?: string): string[] {
  const envPath = process.env.STEAM_FFI_LZMA_LIBRARY_PATH
  const projectRootFromModule = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const platformArch = `${process.platform}-${process.arch}`
  const libName = process.platform === "win32" ? "steam_lzma.dll" : process.platform === "darwin" ? "libsteam_lzma.dylib" : "libsteam_lzma.so"

  return [
    explicitPath,
    envPath,
    path.join(process.cwd(), ".depot-client", "native", libName),
    path.join(process.cwd(), "native", platformArch, libName),
    path.join(process.cwd(), "native", libName),
    path.join(projectRootFromModule, "native", platformArch, libName),
    path.join(projectRootFromModule, "native", libName),
  ].filter((value): value is string => typeof value === "string" && value.length > 0)
}

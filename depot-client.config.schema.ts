import { Type, type Static } from '@feathersjs/typebox'

const SteamDownloadProfileSchema = [Type.Literal('safe'), Type.Literal('medium'), Type.Literal('fast')]

export const AppDownloadProfileSchema = Type.Union(SteamDownloadProfileSchema, {
  description: 'Download profile for Steam app/server files',
  default: 'fast',
  env: 'STEAM_APP_DOWNLOAD_PROFILE'
})

export const WorkshopDownloadProfileSchema = Type.Union(SteamDownloadProfileSchema, {
  description: 'Download profile for Steam workshop items',
  default: 'fast',
  env: 'STEAM_WORKSHOP_DOWNLOAD_PROFILE'
})

export const DepotClientConfigSchema = Type.Object({
  appDownloadProfile: AppDownloadProfileSchema,
  workshopDownloadProfile: WorkshopDownloadProfileSchema,
  branch: Type.String({
    env: 'STEAM_BRANCH',
    default: 'public',
    description: 'Default branch/beta name. Clients may override this per request.'
  }),
  branchPassword: Type.Optional(
    Type.String({
      env: 'STEAM_BRANCH_PASSWORD',
      defaultDoc: '`undefined`',
      description: 'Default password for protected branches. Clients may override this per request.'
    })
  ),
  os: Type.Optional(
    Type.String({
      env: 'STEAM_OS',
      defaultDoc: '`undefined`',
      description: 'Platform filter passed to depot resolution.'
    })
  ),
  arch: Type.Optional(
    Type.String({
      env: 'STEAM_ARCH',
      defaultDoc: '`undefined`',
      description: 'Architecture filter passed to depot resolution.'
    })
  ),
  language: Type.String({
    env: 'STEAM_LANGUAGE',
    default: 'english',
    description: 'Language filter passed to depot resolution.'
  }),
  workshopIncludeChildren: Type.Boolean({
    env: 'STEAM_WORKSHOP_INCLUDE_CHILDREN',
    default: true,
    description: 'Include child/dependency workshop items.'
  }),
  workshopSeparateItemDirectories: Type.Boolean({
    env: 'STEAM_WORKSHOP_SEPARATE_ITEM_DIRS',
    default: true,
    description: 'Keep each workshop item in a separate directory.'
  }),
  workshopCycleMode: Type.Union([Type.Literal('skip'), Type.Literal('throw')], {
    env: 'STEAM_WORKSHOP_CYCLE_MODE',
    default: 'skip',
    description: 'Behavior when workshop dependencies contain cycles.'
  }),

  steamUserConnectionProtocol: Type.Union([Type.Literal('auto'), Type.Literal('tcp'), Type.Literal('websocket')], {
    env: 'STEAM_USER_CONNECTION_PROTOCOL',
    default: 'auto',
    description: 'Connection protocol used by steam-user for Steam CM logon. `auto` currently prefers TCP under Bun; use `websocket` when outbound Steam CM TCP is blocked.'
  }),
  downloadBackend: Type.Union([Type.Literal('bun-cdn'), Type.Literal('managed-chunks'), Type.Literal('steam-user-file')], {
    env: 'STEAM_DOWNLOAD_BACKEND',
    default: 'bun-cdn',
    description: 'Download backend. `bun-cdn` is the native fast path.'
  }),
  maxConcurrentChunks: Type.Number({
    env: 'STEAM_MAX_CONCURRENT_CHUNKS',
    default: 32,
    description: 'Max concurrent chunks per depot for `bun-cdn`/`managed-chunks`.'
  }),
  maxConcurrentDepots: Type.Number({
    env: 'STEAM_MAX_CONCURRENT_DEPOTS',
    default: 3,
    description: 'Max depots processed concurrently.'
  }),
  maxConcurrentFiles: Type.Number({
    env: 'STEAM_MAX_CONCURRENT_FILES',
    default: 6,
    description: 'Max files for `steam-user-file` backend; less relevant for `bun-cdn`.'
  }),
  maxOpenFileHandles: Type.Number({
    env: 'STEAM_MAX_OPEN_FILE_HANDLES',
    default: 64,
    description: 'Max simultaneously open output file handles for managed chunk writing.'
  }),
  bunCdnFetchTimeoutMs: Type.Number({
    env: 'STEAM_BUN_CDN_FETCH_TIMEOUT_MS',
    default: 15000,
    description: 'Per-attempt CDN fetch timeout for `bun-cdn`.'
  }),
  bunCdnFallbackToSteamUser: Type.Boolean({
    env: 'STEAM_BUN_CDN_FALLBACK',
    default: false,
    description: 'Fall back to `steam-user.downloadChunk()` when the native CDN chunk path fails.'
  }),
  progressIntervalMs: Type.Number({
    env: 'STEAM_PROGRESS_INTERVAL_MS',
    default: 500,
    description: 'Minimum interval between emitted progress events from the depot client.'
  }),
  progressPrintIntervalMs: Type.Number({
    env: 'STEAM_PROGRESS_PRINT_INTERVAL_MS',
    default: 1000,
    description: 'Minimum interval between depot-daemon progress log lines.'
  }),
  verifyDownloaded: Type.Union([Type.Literal('full-file'), Type.Literal('chunks-only'), Type.Literal('none')], {
    env: 'STEAM_VERIFY_DOWNLOADED',
    default: 'full-file',
    description: 'Verification policy for freshly downloaded files/chunks. `full-file` is safest; `chunks-only` avoids final full-file reads.'
  }),
  verifyExisting: Type.Optional(
    Type.Boolean({
      env: 'STEAM_VERIFY_EXISTING',
      default: true,
      description: 'Hash existing matching files before skipping.'
    })
  ),
  repairInvalidFiles: Type.Optional(
    Type.Boolean({
      env: 'STEAM_REPAIR_INVALID_FILES',
      default: true,
      description: 'Redownload missing/corrupt files found by validation.'
    })
  ),
  maxValidationRepairAttempts: Type.Number({
    env: 'STEAM_MAX_VALIDATION_REPAIR_ATTEMPTS',
    default: 1,
    description: 'Number of repair passes after validation failure.'
  }),
  validateConcurrentFiles: Type.Number({
    env: 'STEAM_VALIDATE_CONCURRENT_FILES',
    default: 8,
    description: 'Validation-only file concurrency.'
  }),
  validateHashes: Type.Boolean({
    env: 'STEAM_VALIDATE_HASHES',
    default: true,
    description: 'Validation-only hash checking.'
  }),

  bunCdnCompression: Type.Union([Type.Literal('auto'), Type.Literal('steam-user')], {
    env: 'STEAM_CDN_COMPRESSION',
    default: 'auto',
    description: 'Compression strategy for `bun-cdn`.'
  }),
  bunCdnZstdBackend: Type.Union([Type.Literal('auto'), Type.Literal('zstddec'), Type.Literal('mongodb-zstd'), Type.Literal('steam-user')], {
    env: 'STEAM_CDN_ZSTD_BACKEND',
    default: 'auto',
    description: 'Zstd backend for VSZa chunks.'
  }),
  bunCdnLzmaBackend: Type.Union(
    [
      Type.Literal('auto'),
      Type.Literal('ffi-liblzma'),
      Type.Literal('ffi-liblzma-process'),
      Type.Literal('ffi-liblzma-worker'),
      Type.Literal('zig-wasm'),
      Type.Literal('lzma-native'),
      Type.Literal('lzma'),
      Type.Literal('steam-user')
    ],
    {
      env: 'STEAM_CDN_LZMA_BACKEND',
      default: 'auto',
      description: 'LZMA/VZip backend. `auto` prefers process-isolated ffi-liblzma under Bun when available.'
    }
  ),
  bunExecutable: Type.Optional(
    Type.String({
      env: 'STEAM_BUN_EXECUTABLE',
      defaultDoc: '`undefined`',
      description: 'Bun executable used by process-isolated ffi-liblzma workers, especially when main process is not Bun.'
    })
  ),
  ffiLzmaWorkers: Type.Optional(
    Type.Number({
      env: 'STEAM_FFI_LZMA_WORKERS',
      defaultDoc: '`undefined`',
      description: 'Process/worker count for ffi-liblzma decompression.'
    })
  ),
  ffiLzmaProcessRetries: Type.Number({
    env: 'STEAM_FFI_LZMA_PROCESS_RETRIES',
    default: 2,
    description: 'Retry count for process-isolated ffi-liblzma jobs after worker crashes.'
  }),
  ffiLzmaLibraryPath: Type.Optional(
    Type.String({
      env: 'STEAM_FFI_LZMA_LIBRARY_PATH',
      defaultDoc: '`undefined`',
      description: 'Explicit path to `libsteam_lzma`.'
    })
  ),
  ffiLzmaMemlimitBytes: Type.Optional(
    Type.Number({
      env: 'STEAM_FFI_LZMA_MEMLIMIT_BYTES',
      defaultDoc: '`undefined`',
      description: 'liblzma memory limit. Raise if VZip decompression reports memory-limit failures.'
    })
  ),
  nodeExecutable: Type.String({
    env: 'STEAM_NODE_EXECUTABLE',
    default: 'node',
    description: 'Node executable used by the Node/lzma-native worker backend. Mostly irrelevant under Bun unless that backend is selected.'
  }),
  lzmaNativeRequirePath: Type.String({
    env: 'STEAM_LZMA_NATIVE_REQUIRE_PATH',
    default: 'lzma-native',
    description: 'Require path used inside Node lzma-native workers. Internal/advanced.'
  })
})

export type DepotClientConfig = Static<typeof DepotClientConfigSchema>
export type SteamDownloadProfile = Static<typeof AppDownloadProfileSchema>
export type SteamProfileManagedKey = keyof Pick<
  DepotClientConfig,
  'downloadBackend' | 'maxConcurrentChunks' | 'maxConcurrentDepots' | 'maxConcurrentFiles' | 'maxOpenFileHandles' | 'bunCdnFetchTimeoutMs'
>

export const downloadProfiles = ['safe', 'medium', 'fast'] as const
export const steamProfileDefaults: Record<SteamDownloadProfile, Pick<DepotClientConfig, SteamProfileManagedKey>> = {
  safe: {
    downloadBackend: 'bun-cdn',
    maxConcurrentChunks: 8,
    maxConcurrentDepots: 1,
    maxConcurrentFiles: 2,
    maxOpenFileHandles: 16,
    bunCdnFetchTimeoutMs: 30000
  },
  medium: {
    downloadBackend: 'bun-cdn',
    maxConcurrentChunks: 16,
    maxConcurrentDepots: 2,
    maxConcurrentFiles: 4,
    maxOpenFileHandles: 32,
    bunCdnFetchTimeoutMs: 20000
  },
  fast: {
    downloadBackend: 'bun-cdn',
    maxConcurrentChunks: 32,
    maxConcurrentDepots: 3,
    maxConcurrentFiles: 6,
    maxOpenFileHandles: 64,
    bunCdnFetchTimeoutMs: 15000
  }
}

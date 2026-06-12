import { Type, type Static } from "@sinclair/typebox"
import { logger } from "../logger.js"

const SteamDownloadProfileSchema = [Type.Literal("safe"), Type.Literal("medium"), Type.Literal("fast")]
export const AppDownloadProfileSchema = Type.Union(SteamDownloadProfileSchema, {
  description: "Download profile for Steam app/server files",
  default: "fast",
  env: "STEAM_APP_DOWNLOAD_PROFILE",
})
export const WorkshopDownloadProfileSchema = Type.Union(SteamDownloadProfileSchema, {
  description: "Download profile for Steam workshop items",
  default: "fast",
  env: "STEAM_WORKSHOP_DOWNLOAD_PROFILE",
})

export type SteamDownloadProfile = Static<typeof AppDownloadProfileSchema>

export const SteamConfigSchema = Type.Object({
  steamUsername: Type.Optional(
    Type.String({
      env: "STEAM_USERNAME",
      section: "meta",
      defaultDoc: "`undefined`",
      description:
        "The username for the Steam account to use for downloading the server and mods. User/password login is supported but discouraged; prefer QR code login & cached credentials.",
    })
  ),
  steamPassword: Type.Optional(
    Type.String({
      env: "STEAM_PASSWORD",
      section: "meta",
      defaultDoc: "`undefined`",
      description: "The password for the Steam account to use for downloading the server and mods. Discouraged except for bootstrapping credentials.",
    })
  ),
  steamGuardCode: Type.Optional(
    Type.String({
      env: "STEAM_GUARD_CODE",
      section: "server",
      defaultDoc: "`undefined`",
      description: "The Steam Guard code/token for bootstrapping a Steam login when required.",
    })
  ),

  appID: Type.Number({
    env: "STEAM_APP_ID",
    defaultDoc: "`{APP_ID}`",
    noDefault: true,
    description: "The Steam App ID for DayZ Server",
  }),
  appDownloadProfile: AppDownloadProfileSchema,
  workshopDownloadProfile: WorkshopDownloadProfileSchema,

  downloadDirectory: Type.String({
    env: "STEAM_DOWNLOAD_DIRECTORY",
    defaultDoc: "`INSTALL_DIRECTORY`",
    description: "The directory where the server is installed. This should be bind-mounted to a persistent directory on the host.",
  }),
  configDirectory: Type.String({
    description: "The directory where the Steam configuration is stored. Defaults to the value of `/root/.steam`.",
    default: "/root/.steam",
    env: "STEAM_CONFIG_DIRECTORY",
  }),
  branch: Type.String({
    env: "STEAM_BRANCH",
    default: "public",
    description: "The branch/beta name.",
  }),
  branchPassword: Type.Optional(
    Type.String({
      env: "STEAM_BRANCH_PASSWORD",
      defaultDoc: "`undefined`",
      description: "Password for protected branches.",
    })
  ),
  os: Type.Optional(
    Type.String({
      env: "STEAM_OS",
      defaultDoc: "`undefined`",
      description: "Platform filter passed to depot resolution.",
    })
  ),
  arch: Type.Optional(
    Type.String({
      env: "STEAM_ARCH",
      defaultDoc: "`undefined`",
      description: "Architecture filter passed to depot resolution.",
    })
  ),
  language: Type.String({
    env: "STEAM_LANGUAGE",
    default: "english",
    description: "Language filter passed to depot resolution.",
  }),
  workshopIncludeChildren: Type.Boolean({
    env: "STEAM_WORKSHOP_INCLUDE_CHILDREN",
    default: true,
    description: "Include child/dependency workshop items.",
  }),
  workshopSeparateItemDirectories: Type.Boolean({
    env: "STEAM_WORKSHOP_SEPARATE_ITEM_DIRS",
    default: true,
    description: "Keep each workshop item in a separate directory.",
  }),
  workshopCycleMode: Type.Union([Type.Literal("skip"), Type.Literal("throw")], {
    env: "STEAM_WORKSHOP_CYCLE_MODE",
    default: "skip",
    description: "Behavior when workshop dependencies contain cycles.",
  }),

  downloadBackend: Type.Union([Type.Literal("bun-cdn"), Type.Literal("managed-chunks"), Type.Literal("steam-user-file")], {
    env: "STEAM_DOWNLOAD_BACKEND",
    default: "bun-cdn",
    description: "Download backend. `bun-cdn` is the native fast path.",
  }),
  maxConcurrentChunks: Type.Number({
    env: "STEAM_MAX_CONCURRENT_CHUNKS",
    default: 32,
    description: "Max concurrent chunks per depot for `bun-cdn`/`managed-chunks`.",
  }),
  maxConcurrentDepots: Type.Number({
    env: "STEAM_MAX_CONCURRENT_DEPOTS",
    default: 3,
    description: "Max depots processed concurrently.",
  }),
  maxConcurrentFiles: Type.Number({
    env: "STEAM_MAX_CONCURRENT_FILES",
    default: 6,
    description: "Max files for `steam-user-file` backend; less relevant for `bun-cdn`.",
  }),
  maxOpenFileHandles: Type.Number({
    env: "STEAM_MAX_OPEN_FILE_HANDLES",
    default: 64,
    description: "Max simultaneously open output file handles for managed chunk writing.",
  }),
  bunCdnFetchTimeoutMs: Type.Number({
    env: "STEAM_BUN_CDN_FETCH_TIMEOUT_MS",
    default: 15000,
    description: "Per-attempt CDN fetch timeout for `bun-cdn`.",
  }),
  bunCdnFallbackToSteamUser: Type.Boolean({
    env: "STEAM_BUN_CDN_FALLBACK",
    default: false,
    description: "Fall back to `steam-user.downloadChunk()` when the native CDN chunk path fails.",
  }),
  progressIntervalMs: Type.Number({
    env: "STEAM_PROGRESS_INTERVAL_MS",
    default: 500,
    description: "Minimum interval between emitted progress events from the depot client.",
  }),
  progressPrintIntervalMs: Type.Number({
    env: "STEAM_PROGRESS_PRINT_INTERVAL_MS",
    default: 1000,
    description: "Example stdout throttling. Not needed unless ServerZ has console progress rendering.",
  }),
  verifyDownloaded: Type.Union([Type.Literal("full-file"), Type.Literal("chunks-only"), Type.Literal("none")], {
    env: "STEAM_VERIFY_DOWNLOADED",
    default: "full-file",
    description: "Verification policy for freshly downloaded files/chunks. `full-file` is safest; `chunks-only` avoids final full-file reads.",
  }),
  verifyExisting: Type.Optional(
    Type.Boolean({
      env: "STEAM_VERIFY_EXISTING",
      default: true,
      description: "Hash existing matching files before skipping.",
    })
  ),
  repairInvalidFiles: Type.Optional(
    Type.Boolean({
      env: "STEAM_REPAIR_INVALID_FILES",
      default: true,
      description: "Redownload missing/corrupt files found by validation.",
    })
  ),
  maxValidationRepairAttempts: Type.Number({
    env: "STEAM_MAX_VALIDATION_REPAIR_ATTEMPTS",
    default: 1,
    description: "Number of repair passes after validation failure.",
  }),
  validateConcurrentFiles: Type.Number({
    env: "STEAM_VALIDATE_CONCURRENT_FILES",
    default: 8,
    description: "Validation-only file concurrency in example validator.",
  }),
  validateHashes: Type.Boolean({
    env: "STEAM_VALIDATE_HASHES",
    default: true,
    description: "Validation-only hash checking in example validator.",
  }),

  bunCdnCompression: Type.Union([Type.Literal("auto"), Type.Literal("steam-user")], {
    env: "STEAM_CDN_COMPRESSION",
    default: "auto",
    description: "Compression strategy for `bun-cdn`.",
  }),
  bunCdnZstdBackend: Type.Union([Type.Literal("auto"), Type.Literal("zstddec"), Type.Literal("mongodb-zstd"), Type.Literal("steam-user")], {
    env: "STEAM_CDN_ZSTD_BACKEND",
    default: "auto",
    description: "Zstd backend for VSZa chunks.",
  }),
  bunCdnLzmaBackend: Type.Union(
    [
      Type.Literal("auto"),
      Type.Literal("ffi-liblzma"),
      Type.Literal("ffi-liblzma-process"),
      Type.Literal("ffi-liblzma-worker"),
      Type.Literal("zig-wasm"),
      Type.Literal("lzma-native"),
      Type.Literal("lzma"),
      Type.Literal("steam-user"),
    ],
    {
      env: "STEAM_CDN_LZMA_BACKEND",
      default: "auto",
      description: "LZMA/VZip backend. `auto` prefers process-isolated ffi-liblzma under Bun when available.",
    }
  ),
  bunExecutable: Type.Optional(
    Type.String({
      env: "STEAM_BUN_EXECUTABLE",
      defaultDoc: "`undefined`",
      description: "Bun executable used by process-isolated ffi-liblzma workers, especially when main process is not Bun.",
    })
  ),
  ffiLzmaWorkers: Type.Optional(
    Type.Number({
      env: "STEAM_FFI_LZMA_WORKERS",
      defaultDoc: "`undefined`",
      description: "Process/worker count for ffi-liblzma decompression.",
    })
  ),
  ffiLzmaProcessRetries: Type.Number({
    env: "STEAM_FFI_LZMA_PROCESS_RETRIES",
    default: 2,
    description: "Retry count for process-isolated ffi-liblzma jobs after worker crashes.",
  }),
  ffiLzmaLibraryPath: Type.Optional(
    Type.String({
      env: "STEAM_FFI_LZMA_LIBRARY_PATH",
      defaultDoc: "`undefined`",
      description: "Explicit path to `libsteam_lzma`.",
    })
  ),
  ffiLzmaMemlimitBytes: Type.Optional(
    Type.Number({
      env: "STEAM_FFI_LZMA_MEMLIMIT_BYTES",
      defaultDoc: "`undefined`",
      description: "liblzma memory limit. Raise if VZip decompression reports memory-limit failures.",
    })
  ),
  nodeExecutable: Type.String({
    env: "STEAM_NODE_EXECUTABLE",
    default: "node",
    description: "Node executable used by the Node/lzma-native worker backend. Mostly irrelevant under Bun unless that backend is selected.",
  }),
  lzmaNativeRequirePath: Type.String({
    env: "STEAM_LZMA_NATIVE_REQUIRE_PATH",
    default: "lzma-native",
    description: "Require path used inside Node lzma-native workers. Internal/advanced.",
  }),
})

export type SteamConfig = Static<typeof SteamConfigSchema>
export type SteamProfileManagedKey = keyof Pick<
  SteamConfig,
  "downloadBackend" | "maxConcurrentChunks" | "maxConcurrentDepots" | "maxConcurrentFiles" | "maxOpenFileHandles" | "bunCdnFetchTimeoutMs"
>

const downloadProfiles = ["safe", "medium", "fast"] as const
const steamProfileManagedKeys = [
  "downloadBackend",
  "maxConcurrentChunks",
  "maxConcurrentDepots",
  "maxConcurrentFiles",
  "maxOpenFileHandles",
  "bunCdnFetchTimeoutMs",
] as const satisfies readonly SteamProfileManagedKey[]
const steamProfileDefaults: Record<SteamDownloadProfile, Pick<SteamConfig, SteamProfileManagedKey>> = {
  safe: {
    downloadBackend: "bun-cdn",
    maxConcurrentChunks: 8,
    maxConcurrentDepots: 1,
    maxConcurrentFiles: 2,
    maxOpenFileHandles: 16,
    bunCdnFetchTimeoutMs: 30000,
  },
  medium: {
    downloadBackend: "bun-cdn",
    maxConcurrentChunks: 16,
    maxConcurrentDepots: 2,
    maxConcurrentFiles: 4,
    maxOpenFileHandles: 32,
    bunCdnFetchTimeoutMs: 20000,
  },
  fast: {
    downloadBackend: "bun-cdn",
    maxConcurrentChunks: 32,
    maxConcurrentDepots: 3,
    maxConcurrentFiles: 6,
    maxOpenFileHandles: 64,
    bunCdnFetchTimeoutMs: 15000,
  },
}

export function resolveSteamDownloadProfile(value: unknown, defaultProfile: SteamDownloadProfile): SteamDownloadProfile {
  if (typeof value === "string" && downloadProfiles.includes(value as SteamDownloadProfile)) return value as SteamDownloadProfile
  if (value !== undefined && value !== null && value !== "") logger.warn(`Invalid Steam download profile "${JSON.stringify(value)}"; falling back to safe`)
  return value === undefined || value === null || value === "" ? defaultProfile : "safe"
}

export function getSteamProfileManagedDefaults(profile: SteamDownloadProfile): Pick<SteamConfig, SteamProfileManagedKey> {
  return steamProfileDefaults[profile]
}

export function getSteamProfileManagedKeys(): readonly SteamProfileManagedKey[] {
  return steamProfileManagedKeys
}

export function normalizeSteamConfig(
  rawConfig: { meta?: Record<string, unknown>; steam?: Record<string, unknown> },
  defaults: { steam?: Partial<SteamConfig> }
) {
  rawConfig.steam ??= {}
  const steam = rawConfig.steam
  const meta = rawConfig.meta ?? {}

  steam["appID"] ??= meta["appID"]
  steam["downloadDirectory"] ??= meta["installDirectory"]

  for (const key of [
    "steamGuardCode",
    "branchPassword",
    "os",
    "arch",
    "verifyExisting",
    "repairInvalidFiles",
    "bunExecutable",
    "ffiLzmaWorkers",
    "ffiLzmaLibraryPath",
    "ffiLzmaMemlimitBytes",
  ])
    if (steam[key] === null || steam[key] === "") steam[key] = undefined

  if (!Array.isArray(steam["depots"]) && typeof steam["depots"] === "string" && String(steam["depots"]).length > 0) {
    steam["depots"] = String(steam["depots"])
      .split(",")
      .map((depot) => Number(depot.trim()))
      .filter((depot) => Number.isFinite(depot))
  } else if (!Array.isArray(steam["depots"])) {
    steam["depots"] = undefined
  }

  const defaultAppProfile = defaults.steam?.appDownloadProfile ?? "fast"
  steam["appDownloadProfile"] = resolveSteamDownloadProfile(steam["appDownloadProfile"], defaultAppProfile)
  steam["workshopDownloadProfile"] = resolveSteamDownloadProfile(steam["workshopDownloadProfile"], steam["appDownloadProfile"] as SteamDownloadProfile)
}

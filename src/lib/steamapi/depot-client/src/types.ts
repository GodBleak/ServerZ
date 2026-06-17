export type MaybePromise<T> = T | Promise<T>

export type SteamUserConnectionProtocol = "auto" | "tcp" | "websocket"

export type DownloadBackend = "bun-cdn" | "managed-chunks" | "steam-user-file"
export type DownloadVerificationMode = "full-file" | "chunks-only" | "none"
export type ValidationStatus = "valid" | "missing" | "size-mismatch" | "hash-mismatch" | "unchecked"
export type DownloadProfilingMode = boolean | "summary" | "verbose"
export type BunCdnCompressionMode = "auto" | "steam-user"
export type BunCdnZstdBackend = "auto" | "zstddec" | "mongodb-zstd" | "steam-user"
export type BunCdnLzmaBackend = "auto" | "ffi-liblzma" | "ffi-liblzma-process" | "ffi-liblzma-worker" | "zig-wasm" | "lzma-native" | "lzma" | "steam-user"
export type SteamCdnCompressionType = "zip" | "zstd" | "vzip" | "unknown"
export type WorkshopCycleMode = "skip" | "throw"

export interface CompressionBucketProfile {
  chunks: number
  compressedBytes: number
  decompressedBytes: number
  ms: number
  fallbacks: number
  backends: Record<string, number>
}

export type CompressionProfile = Record<SteamCdnCompressionType, CompressionBucketProfile>

export interface DownloadStageTimings {
  resolveManifestMs: number
  manifestMs: number
  depotKeyMs: number
  planMs: number
  existingCheckMs: number
  createSparseFileMs: number
  contentServersMs: number
  steamUserFileMs: number
  chunkDownloadMs: number
  bunCdnFetchMs: number
  bunCdnDecryptMs: number
  bunCdnDecompressMs: number
  bunCdnVerifyMs: number
  fileWriteMs: number
  fullFileVerifyMs: number
  stateWriteMs: number
  totalMs: number
}

export interface ChunkDownloadProfile {
  total: number
  completed: number
  failed: number
  retries: number
  bytes: number
  averageDownloadMs: number
  averageWriteMs: number
  maxDownloadMs: number
  maxWriteMs: number
}

export interface FileDownloadProfile {
  selected: number
  planned: number
  skipped: number
  downloaded: number
  failed: number
  zeroByte: number
}

export interface DownloadDepotProfile {
  appId: number
  contentAppId: number
  depotId: number
  branch: string
  manifestId?: string
  backend: DownloadBackend
  startedAt: string
  finishedAt: string
  durationMs: number
  timings: DownloadStageTimings
  chunks: ChunkDownloadProfile
  files: FileDownloadProfile
  compression: CompressionProfile
}

export interface DownloadAppProfile {
  appId: number
  branch: string
  startedAt: string
  finishedAt: string
  durationMs: number
  depots: DownloadDepotProfile[]
  totals: {
    downloadedBytes: number
    totalBytes: number
    chunks: ChunkDownloadProfile
    files: FileDownloadProfile
    timings: DownloadStageTimings
    compression: CompressionProfile
  }
}

export interface CloseOptions {
  /** How long to wait for steam-user's disconnected event after logOff(). Default 2000ms. */
  timeoutMs?: number
  /** Remove listeners after logoff/timeout so examples and short-lived CLIs can exit cleanly. Default false. */
  force?: boolean
}

export type SteamCredentialCacheOptions =
  | boolean
  | {
      /** Defaults to true when dataDirectory is set. */
      enabled?: boolean
      /** Defaults to credentials.json under dataDirectory. */
      fileName?: string
      /** Absolute or relative file path. Overrides dataDirectory/fileName. */
      filePath?: string
    }

export interface SteamCredentials {
  accountName?: string
  steamID?: string
  refreshToken: string
  accessToken?: string
  updatedAt?: string
  expiresAt?: number
}

export interface SteamDepotClientOptions {
  /** Use an existing steam-user instance instead of creating one. Useful for apps that already own connection lifecycle. */
  user?: SteamUserLike
  /**
   * Shared data directory for steam-user's own cache plus this wrapper's credential cache.
   * steam-user stores server/machine-auth data here; this wrapper stores credentials.json here by default.
   */
  dataDirectory?: string
  /**
   * Persist Steam refresh tokens to a JSON file. Defaults to enabled when dataDirectory is supplied.
   * Set false to opt out, or pass { filePath } / { fileName } to customize.
   */
  credentialCache?: SteamCredentialCacheOptions
  /**
   * Steam CM transport used by steam-user for the client connection.
   *
   * - auto: steam-user decides under Node, TCP under Bun.
   * - tcp: avoids Bun TLS hostname issues against Steam WebSocket CM hosts.
   * - websocket: force steam-user's WebSocket CM transport.
   *
   * steamUserOptions.protocol, webCompatibilityMode, and socksProxy can still override or force steam-user behavior.
   */
  steamUserConnectionProtocol?: SteamUserConnectionProtocol
  /** Extra constructor options forwarded to steam-user. Values here override this package's defaults. */
  steamUserOptions?: Record<string, unknown>
  /** Defaults to public. */
  defaultBranch?: string
}

export interface LoginWithRefreshTokenOptions {
  steamID?: string
  logonID?: number | string
  machineName?: string
  clientOS?: number
  timeoutMs?: number
  /** Persist the supplied/renewed refresh token. Defaults to true when credential caching is enabled. */
  saveCredentials?: boolean
}

export interface LoginWithSavedCredentialsOptions extends LoginWithRefreshTokenOptions {
  /** Override the refresh token source while still saving it to the cache after login. */
  refreshToken?: string
}

export interface LoginAnonymousOptions {
  machineName?: string
  clientOS?: number
  timeoutMs?: number
}

export interface LoginWithCredentialsOptions {
  saveCredentials?: boolean
  timeoutMs?: number
  steamID?: string
  refreshToken?: string
  authCode?: string
  machineAuthToken?: string
  webLogonToken?: string
  logonID?: number | string
  machineName?: string
  clientOS?: number
}

export interface QrLoginOptions extends LoginWithRefreshTokenOptions {
  /** How long steam-session waits after polling starts before timing out. */
  loginTimeoutMs?: number
  /** Friendly device name shown by Steam for this auth attempt. */
  machineFriendlyName?: string
  /** Called as soon as the QR challenge URL exists. Render this as a QR code in your UI. */
  onChallenge?: (challenge: QrChallenge) => void
  /**
   * Which steam-session auth transport to use for SteamClient QR login.
   *
   * - auto: WebAPI under Bun, WebSocket CM elsewhere.
   * - webapi: avoids Bun TLS hostname issues against some Steam CM hosts.
   * - websocket: steam-session's default SteamClient transport.
   *
   * If sessionOptions.transport is supplied, this option is ignored.
   */
  qrTransport?: "auto" | "webapi" | "websocket"
  /** Advanced steam-session constructor options. */
  sessionOptions?: Record<string, unknown>
}

export interface QrChallenge {
  qrChallengeUrl: string
}

export interface LoginResult {
  accountName?: string
  steamID?: string
  refreshToken: string
  accessToken?: string
}

export interface PlatformFilters {
  os?: string
  arch?: string
  language?: string
  includeAllPlatforms?: boolean
  includeAllArchitectures?: boolean
  includeAllLanguages?: boolean
  includeLowViolence?: boolean
}

export interface ProductInfoResult {
  apps: Record<string, SteamProductInfo>
  packages: Record<string, SteamProductInfo>
  unknownApps?: number[]
  unknownPackages?: number[]
}

export interface SteamProductInfo {
  changenumber?: number
  missingToken?: boolean
  appinfo?: SteamAppInfo
  packageinfo?: Record<string, unknown>
  [key: string]: unknown
}

export interface SteamAppInfo {
  appid?: number | string
  common?: Record<string, unknown>
  depots?: SteamAppDepots
  [key: string]: unknown
}

export type SteamAppDepots = Record<string, SteamDepotSection> & {
  branches?: Record<string, SteamBranchInfo>
}

export interface SteamBranchInfo {
  buildid?: string | number
  description?: string
  pwdrequired?: string | number | boolean
  timeupdated?: string | number
  [key: string]: unknown
}

export interface SteamDepotSection {
  name?: string
  manifests?: Record<string, SteamManifestReference>
  encryptedmanifests?: Record<string, SteamEncryptedManifestReference>
  config?: SteamDepotConfig
  depotfromapp?: string | number
  maxsize?: string | number
  [key: string]: unknown
}

export interface SteamManifestReference {
  gid?: string
  size?: string | number
  download?: string | number
  [key: string]: unknown
}

export interface SteamEncryptedManifestReference {
  encrypted_gid?: string
  encrypted_gid_2?: string
  [key: string]: unknown
}

export interface SteamDepotConfig {
  oslist?: string
  osarch?: string
  language?: string
  lowviolence?: string | number | boolean
  [key: string]: unknown
}

export interface DepotDescriptor {
  appId: number
  /** AppID that SteamPipe should use for manifest request codes/content access. Differs from appId for depotfromapp shared depots. */
  contentAppId: number
  depotId: number
  name?: string
  config?: SteamDepotConfig
  branch: string
  manifestId?: string
  encrypted?: boolean
  sourceAppId?: number
}

export interface ResolveDepotsOptions extends PlatformFilters {
  branch?: string
  depots?: number[]
  includeTokens?: boolean
  branchPassword?: string
}

export interface ResolveManifestOptions {
  appId: number
  /** AppID whose appinfo should be used to resolve the manifest. Defaults to appId. Use for depotfromapp/shared depots. */
  contentAppId?: number
  depotId: number
  branch?: string
  branchPassword?: string
  includeTokens?: boolean
}

export enum DepotFileFlags {
  UserConfig = 1,
  VersionedUserConfig = 2,
  Encrypted = 4,
  ReadOnly = 8,
  Hidden = 16,
  Executable = 32,
  Directory = 64,
  CustomExecutable = 128,
  InstallScript = 256,
  Symlink = 512,
}

export interface SteamDepotManifest {
  depot_id?: number | string
  gid_manifest?: string
  creation_time?: number | string
  filenames_encrypted?: boolean
  total_uncompressed_size?: string | number
  total_compressed_size?: string | number
  files?: SteamDepotFile[]
  [key: string]: unknown
}

export interface SteamDepotFile {
  filename: string
  size?: string | number
  flags?: number
  sha_content?: string
  sha_filename?: string
  chunks?: SteamDepotChunk[]
  [key: string]: unknown
}

export interface SteamDepotChunk {
  sha: string
  crc?: number
  offset?: string | number
  cb_original?: string | number
  cb_compressed?: string | number
  [key: string]: unknown
}

export type FileMatcher = string | RegExp | ((file: SteamDepotFile) => boolean)

export interface DownloadDepotOptions {
  appId: number
  /** AppID to pass to SteamPipe/CDN calls. Defaults to appId. Use for depotfromapp shared depots. */
  contentAppId?: number
  depotId: number
  /** Output root. Depot file paths are resolved beneath this directory. */
  directory: string
  manifestId?: string | number | bigint
  branch?: string
  branchPassword?: string
  includeTokens?: boolean
  include?: FileMatcher[]
  exclude?: FileMatcher[]
  filter?: (file: SteamDepotFile) => MaybePromise<boolean>
  /** Default false. If false, files that already match size/hash are skipped. */
  overwrite?: boolean
  /**
   * If true, matching existing files are hashed before skipping.
   * Defaults to true when verifyDownloaded is full-file; otherwise false.
   */
  verifyExisting?: boolean
  /** Default true. Symlinks are skipped because applying Steam symlinks portably is runtime-specific. */
  skipSymlinks?: boolean
  /**
   * Download backend. Default bun-cdn.
   *
   * - bun-cdn: this package schedules chunks, fetches CDN chunks with fetch/Bun, decrypts/decompresses/verifies, and writes files.
   * - managed-chunks: this package schedules chunks and writes files, but still uses steam-user.downloadChunk() for chunk bytes.
   * - steam-user-file: compatibility mode using steam-user.downloadFile(), including its built-in full-file verification.
   */
  downloadBackend?: DownloadBackend
  /**
   * Max files to download at the same time for the steam-user-file backend. Default 6.
   * Ignored by managed-chunks, which schedules chunks globally per depot.
   */
  maxConcurrentFiles?: number
  /**
   * Max chunks to download at the same time per depot for bun-cdn and managed-chunks. Default 32.
   */
  maxConcurrentChunks?: number
  /**
   * Max retry attempts per chunk for bun-cdn and managed-chunks. Default 5.
   */
  maxChunkRetries?: number
  /**
   * Per-attempt CDN fetch timeout in milliseconds for the bun-cdn backend. Default 15000.
   */
  bunCdnFetchTimeoutMs?: number
  /**
   * If true, bun-cdn falls back to steam-user.downloadChunk() when its own fetch/decrypt path fails for a chunk.
   * Default false so benchmarks expose bun-cdn issues instead of silently taking the slow path.
   */
  bunCdnFallbackToSteamUser?: boolean
  /**
   * Compression strategy for bun-cdn. Default auto: fast ZIP via node:zlib, explicit Zstd decoders, and process-isolated ffi-liblzma/lzma for Steam VZip/LZMA chunks.
   */
  bunCdnCompression?: BunCdnCompressionMode
  /**
   * Zstd backend for VSZa chunks. Default auto: @mongodb-js/zstd if installed, otherwise zstddec.
   */
  bunCdnZstdBackend?: BunCdnZstdBackend
  /**
   * LZMA backend for VZa/VZip chunks. Default auto: process-isolated ffi-liblzma when running under Bun or when STEAM_BUN_EXECUTABLE is configured, then pure-JS lzma. `ffi-liblzma-worker` keeps the older Bun Worker + bun:ffi implementation for experiments only.
   */
  bunCdnLzmaBackend?: BunCdnLzmaBackend
  /**
   * Bun executable used by the process-isolated ffi-liblzma backend when the main process is not Bun. Also configurable with STEAM_BUN_EXECUTABLE.
   */
  bunCdnFfiLzmaBunExecutable?: string
  /**
   * Process/worker count for the ffi-liblzma VZip backend. Defaults to 3x detected logical CPU count, capped at 64. Also configurable with STEAM_FFI_LZMA_WORKERS.
   */
  bunCdnFfiLzmaWorkers?: number
  /**
   * Retry count for process-isolated ffi-liblzma jobs after child-process crashes. Default 2.
   */
  bunCdnFfiLzmaProcessRetries?: number
  /**
   * Optional path to libsteam_lzma for the ffi-liblzma backend. Also configurable with STEAM_FFI_LZMA_LIBRARY_PATH.
   */
  bunCdnFfiLzmaLibraryPath?: string
  /**
   * liblzma memory limit in bytes for ffi-liblzma. Default 8 GiB.
   */
  bunCdnFfiLzmaMemlimitBytes?: number
  /**
   * Max simultaneously-open output file handles for managed-chunks. Default 64.
   */
  maxOpenFileHandles?: number
  /**
   * Verification policy for freshly downloaded files/chunks. Default full-file.
   *
   * - full-file: verify chunks during download, then SHA1 each completed file. Existing matching files are hashed before skipping.
   * - chunks-only: verify downloaded chunks but skip the final full-file read. Existing matching files are skipped by size unless verifyExisting is true.
   * - none: skip this package's chunk/full-file verification. Decompression errors can still fail a chunk.
   */
  verifyDownloaded?: DownloadVerificationMode
  /**
   * Minimum milliseconds between fileProgress events per output path. Default 250.
   * Set 0 to emit every underlying steam-user progress callback. This can be noisy and slow if your listener writes to stdout.
   */
  progressIntervalMs?: number
  /**
   * Order selected files before downloading. Default size-desc to keep network workers busy.
   */
  fileOrder?: "manifest" | "size-desc" | "size-asc"
  /**
   * When full-file validation finds missing/corrupt files, redownload them automatically.
   * Defaults to true when verifyDownloaded is full-file.
   */
  repairInvalidFiles?: boolean
  /**
   * Number of repair passes after a full-file validation failure. Default 1.
   * A value of 1 means: download once, validate, then redownload failed files once.
   */
  maxValidationRepairAttempts?: number
  /** Continue downloading remaining files if one fails. Default false. */
  continueOnError?: boolean
  /** Collect per-stage benchmark timings and attach them to results. Default false. */
  profile?: DownloadProfilingMode
  /** State directory. Defaults to <directory>/.depot-client. */
  stateDirectory?: string
  /** Plan and resolve manifests without writing files. */
  dryRun?: boolean
  /** Skip the up-front depot-key probe. Mostly useful for tests/mocks. Default false. */
  skipDepotKeyCheck?: boolean
  /** Pre-resolved manifest used internally to avoid fetching the same manifest twice. */
  manifest?: SteamDepotManifest
  /**
   * AbortSignal to cancel an in-progress download. When the signal fires, any
   * pending chunk or file download promises reject with an AbortError.
   * No-op if omitted or never aborted.
   */
  signal?: AbortSignal
  /**
   * Timeout in milliseconds for Steam API calls (getManifest, getDepotDecryptionKey,
   * getProductInfo, getContentServers). When exceeded, the operation rejects.
   * No timeout if omitted.
   */
  apiTimeoutMs?: number
}

export interface DownloadAppOptions extends Omit<DownloadDepotOptions, "depotId" | "manifestId" | "contentAppId">, PlatformFilters {
  depots?: Array<number | { depotId: number; manifestId?: string | number | bigint }>
  /** Max depots to download at the same time. Default 2. */
  maxConcurrentDepots?: number
  /**
   * If true, depots that Steam denies a decryption key for are reported and skipped.
   * If false, the first denied depot rejects the app download. Default false.
   */
  skipUnavailableDepots?: boolean
}

export interface FileValidationResult {
  file: SteamDepotFile
  outputPath: string
  status: ValidationStatus
  expectedBytes: number
  actualBytes: number | null
  expectedSha1?: string
  actualSha1?: string
  error?: Error
}

export type ValidationRepairDownloadOptions = Partial<
  Omit<
    DownloadDepotOptions,
    | "appId"
    | "contentAppId"
    | "depotId"
    | "directory"
    | "manifestId"
    | "branch"
    | "branchPassword"
    | "includeTokens"
    | "include"
    | "exclude"
    | "filter"
    | "dryRun"
  >
>

export interface ValidateDepotOptions extends Omit<
  DownloadDepotOptions,
  | "downloadBackend"
  | "maxConcurrentFiles"
  | "maxConcurrentChunks"
  | "maxChunkRetries"
  | "bunCdnFetchTimeoutMs"
  | "bunCdnFallbackToSteamUser"
  | "bunCdnCompression"
  | "bunCdnZstdBackend"
  | "bunCdnLzmaBackend"
  | "bunCdnFfiLzmaWorkers"
  | "bunCdnFfiLzmaBunExecutable"
  | "bunCdnFfiLzmaProcessRetries"
  | "bunCdnFfiLzmaLibraryPath"
  | "bunCdnFfiLzmaMemlimitBytes"
  | "maxOpenFileHandles"
  | "verifyDownloaded"
  | "overwrite"
  | "dryRun"
  | "skipDepotKeyCheck"
> {
  /** Max files to hash concurrently. Default 8. */
  maxConcurrentFiles?: number
  /** If false, only size is checked. Default true. */
  verifyHashes?: boolean
  /**
   * If true, validateApp()/validateDepot() redownload files that are missing, size-mismatched, or hash-mismatched, then validates again.
   * Default false for validate-only calls. downloadApp() has its own default repair behavior in full-file mode.
   */
  repairInvalidFiles?: boolean
  /** Number of validate-and-repair passes. Default 1. */
  maxValidationRepairAttempts?: number
  /** Download options used only for validation repair redownloads. Forced fields like app/depot/directory/include are still controlled by validation. */
  repairDownloadOptions?: ValidationRepairDownloadOptions
}

export interface ValidateAppOptions extends Omit<ValidateDepotOptions, "depotId" | "manifestId" | "contentAppId">, PlatformFilters {
  depots?: Array<number | { depotId: number; manifestId?: string | number | bigint }>
  /** Max depots to validate at the same time. Default 2. */
  maxConcurrentDepots?: number
  /** If true, depots denied by Steam are reported and skipped. Default false. */
  skipUnavailableDepots?: boolean
}

export interface ValidateDepotResult {
  appId: number
  contentAppId: number
  depotId: number
  branch: string
  manifestId: string
  directory: string
  files: FileValidationResult[]
  totalBytes: number
  validBytes: number
  valid: number
  missing: number
  invalid: number
  unchecked: number
  /** Number of files redownloaded by validate repair. */
  repaired: number
  /** Number of repair passes actually run. */
  repairAttempts: number
  /** File download results from repair passes. */
  repairedFiles: FileDownloadResult[]
  durationMs: number
}

export interface ValidateAppResult {
  appId: number
  branch: string
  directory: string
  depots: ValidateDepotResult[]
  skippedDepots: DownloadDepotSkippedResult[]
  totalBytes: number
  validBytes: number
  valid: number
  missing: number
  invalid: number
  unchecked: number
  repaired: number
  repairAttempts: number
  repairedFiles: FileDownloadResult[]
  durationMs: number
}

export interface FileDownloadProgress {
  appId: number
  /** App ID used for SteamPipe content/manifest access. May differ from appId for shared/workshop depots. */
  contentAppId: number
  depotId: number
  manifestId: string
  file: SteamDepotFile
  fileIndex: number
  fileCount: number
  bytesDownloaded: number
  fileSizeBytes: number
  totalBytesDownloaded: number
  totalSizeBytes: number
  outputPath: string
}

export interface FileDownloadResult {
  file: SteamDepotFile
  outputPath: string
  status: "downloaded" | "skipped" | "planned" | "failed"
  bytes: number
  error?: Error
}

export interface DownloadDepotResult {
  appId: number
  contentAppId: number
  depotId: number
  branch: string
  manifestId: string
  directory: string
  files: FileDownloadResult[]
  /** Bytes actually transferred during this operation. Does not include already-current/skipped files. */
  downloadedBytes: number
  /** Bytes that are now complete for this operation: downloaded plus verified/current skipped files. */
  completedBytes: number
  /** Bytes skipped because the output file was already current/valid. */
  skippedBytes: number
  /** Bytes for files that failed to download or validate. */
  failedBytes: number
  totalBytes: number
  profile?: DownloadDepotProfile
}

export interface DownloadDepotSkippedResult {
  appId: number
  contentAppId: number
  depotId: number
  branch: string
  directory: string
  manifestId?: string
  reason: "access-denied"
  error: Error
}

export interface DownloadAppResult {
  appId: number
  branch: string
  directory: string
  depots: DownloadDepotResult[]
  skippedDepots: DownloadDepotSkippedResult[]
  profile?: DownloadAppProfile
}

export interface DownloadAppProgress {
  appId: number
  branch: string
  directory: string
  source?: "app" | "workshop"
  publishedFileId?: string
  /** Bytes actually transferred during this operation. */
  totalBytesDownloaded: number
  /** Bytes that are complete/available for this operation, including already-current skipped files. */
  totalBytesCompleted: number
  /** Bytes known to have failed during this operation. */
  totalBytesFailed: number
  totalBytesDiscovered: number
  /** Completion percentage based on completed bytes, not raw transferred bytes. */
  percent: number | null
  depotsTotal: number
  depotsStarted: number
  depotsCompleted: number
  depotsSkipped: number
  depotsFailed: number
  activeDepotId?: number
}

export interface SteamPublishedFileDetails {
  publishedfileid?: string | number
  result?: number
  title?: string
  filename?: string
  file_type?: number | string
  consumer_appid?: number | string
  creator_appid?: number | string
  hcontent_file?: string | number | bigint
  file_url?: string
  children?: Array<{ publishedfileid?: string | number | bigint }>
  [key: string]: unknown
}

export interface ResolvedWorkshopFile {
  publishedFileId: string
  /** Caller/request app used for install context and result grouping. */
  appId: number
  /** App ID used for SteamPipe content/manifest access. May differ for shared workshop depots. */
  contentAppId?: number
  title?: string
  filename?: string
  fileType?: number
  source: "manifest" | "url" | "collection"
  manifestId?: string
  depotId?: number
  fileUrl?: string
  children?: ResolvedWorkshopFile[]
  details: SteamPublishedFileDetails
}

export interface ResolveWorkshopFileOptions {
  appId: number
  publishedFileId: string | number | bigint
  includeChildren?: boolean
  /** What to do when a real collection cycle is found. Default 'skip'. */
  cycleMode?: WorkshopCycleMode
}

export interface DownloadWorkshopFileOptions extends Omit<DownloadAppOptions, "appId" | "depots"> {
  appId: number
  publishedFileId: string | number | bigint
  includeChildren?: boolean
  /** What to do when a real collection cycle is found. Default 'skip'. */
  workshopCycleMode?: WorkshopCycleMode
  /** Download each workshop item under <directory>/<publishedFileId>. Default true. */
  separateItemDirectories?: boolean
  /** Per-request timeout for direct URL-backed workshop files in milliseconds. Default 15000. */
  workshopWebFileFetchTimeoutMs?: number
}

export interface DownloadWorkshopFileResult {
  appId: number
  publishedFileId: string
  directory: string
  files: ResolvedWorkshopFile[]
  depots: DownloadDepotResult[]
  webFiles: FileDownloadResult[]
  skippedDepots: DownloadDepotSkippedResult[]
  profile?: DownloadAppProfile
}

export interface SteamUserLike {
  logOn(details?: Record<string, unknown>): void
  logOff(): void
  on(event: string, listener: (...args: unknown[]) => void): this
  once(event: string, listener: (...args: unknown[]) => void): this
  off?(event: string, listener: (...args: unknown[]) => void): this
  removeListener(event: string, listener: (...args: unknown[]) => void): this
  removeAllListeners?(event?: string): this
  emit?(event: string, ...args: unknown[]): boolean
  getProductInfo(
    apps: Array<number | { appid: number; access_token?: string }>,
    packages: Array<number | { packageid: number; access_token?: string }>,
    inclTokens?: boolean
  ): Promise<ProductInfoResult>
  getManifest(appId: number, depotId: number, manifestId: string, branchName?: string, branchPassword?: string): Promise<{ manifest: SteamDepotManifest }>
  getDepotDecryptionKey(appId: number, depotId: number): Promise<{ key: Buffer }>
  getAppBetaDecryptionKeys(appId: number, password: string): Promise<{ keys: Record<string, Buffer> }>
  getContentServers(appId?: number): Promise<{ servers: SteamContentServer[] }>
  getCDNAuthToken(appId: number, depotId: number, hostname: string): Promise<{ token: string; expires: Date }>
  downloadChunk(appId: number, depotId: number, chunkSha1: string, contentServer?: SteamContentServer): Promise<{ chunk: Buffer }>
  downloadFile(
    appId: number,
    depotId: number,
    file: SteamDepotFile,
    outputFilePath: string,
    callback?: (err: Error | null, status?: { type: string; bytesDownloaded?: number; totalSizeBytes?: number }) => void
  ): Promise<unknown>
  getPublishedFileDetails?(ids: Array<string | number | bigint> | string | number | bigint): Promise<{ files: Record<string, SteamPublishedFileDetails> }>
}

export interface SteamContentServer {
  Host: string
  vhost?: string
  https_support?: string
  usetokenauth?: number | string
  type?: string
  load?: number
  weightedload?: number
  [key: string]: unknown
}

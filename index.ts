export { SteamDepotClient, DepotAccessDeniedError, type DepotAccessDeniedDetails, type SteamDepotClientEvents } from './SteamDepotClient.js';
export { QrLoginAttempt, type QrLoginAttemptEvents } from './AuthSession.js';
export { resolveDepotsFromAppInfo, resolveManifestIdFromAppInfo, extractManifestId } from './DepotResolver.js';
export { DepotStateStore, type DepotStateFile } from './download/StateStore.js';
export { BunCdnChunkDownloader, type BunCdnChunkDownloaderOptions } from './download/BunCdnChunkDownloader.js';
export { loadFfiLzma, decompressLzmaAloneWithFfi, resolveFfiLzmaLibraryPath, resolveFfiLzmaMemlimitBytes, DEFAULT_FFI_LZMA_MEMLIMIT_BYTES, type FfiLzmaOptions, type FfiLzmaBinding } from './download/FfiLzma.js';
export { FfiLzmaProcessPool, type FfiLzmaProcessPoolOptions } from './download/FfiLzmaProcessPool.js';
export { closeSteamCdnCompressionWorkers, decompressSteamCdnChunk, detectCompressionType, SteamCdnCompressionContext, type SteamCdnCompressionOptions, type SteamCdnCompressionResult, type SteamCdnCompressionBackend } from './download/SteamCdnCompression.js';
export { SteamCredentialStore, type SteamCredentialStoreOptions } from './auth/CredentialStore.js';
export { DepotFileFlags } from './types.js';
export type {
  CloseOptions,
  DepotDescriptor,
  DownloadBackend,
  DownloadVerificationMode,
  DownloadProfilingMode,
  BunCdnCompressionMode,
  BunCdnZstdBackend,
  BunCdnLzmaBackend,
  SteamCdnCompressionType,
  WorkshopCycleMode,
  CompressionBucketProfile,
  CompressionProfile,
  DownloadStageTimings,
  ChunkDownloadProfile,
  FileDownloadProfile,
  DownloadDepotProfile,
  DownloadAppProfile,
  DownloadAppOptions,
  DownloadAppResult,
  DownloadAppProgress,
  DownloadDepotOptions,
  DownloadDepotResult,
  DownloadDepotSkippedResult,
  DownloadWorkshopFileOptions,
  DownloadWorkshopFileResult,
  FileDownloadProgress,
  FileDownloadResult,
  FileValidationResult,
  ValidationStatus,
  ValidateDepotOptions,
  ValidateDepotResult,
  ValidateAppOptions,
  ValidateAppResult,
  FileMatcher,
  LoginAnonymousOptions,
  LoginResult,
  LoginWithRefreshTokenOptions,
  LoginWithSavedCredentialsOptions,
  PlatformFilters,
  ProductInfoResult,
  QrChallenge,
  QrLoginOptions,
  ResolveDepotsOptions,
  ResolveManifestOptions,
  SteamAppInfo,
  SteamAppDepots,
  SteamBranchInfo,
  SteamDepotChunk,
  SteamDepotConfig,
  SteamDepotFile,
  SteamDepotManifest,
  SteamDepotSection,
  SteamEncryptedManifestReference,
  SteamManifestReference,
  SteamProductInfo,
  SteamPublishedFileDetails,
  ResolvedWorkshopFile,
  ResolveWorkshopFileOptions,
  SteamCredentialCacheOptions,
  SteamCredentials,
  SteamContentServer,
  SteamUserConnectionProtocol,
  SteamUserLike
} from './types.js';
export { WebApiAuthTransport } from './auth/WebApiAuthTransport.js';
export type { SteamAuthApiRequest, SteamAuthApiResponse, SteamAuthTransport, WebApiAuthTransportOptions } from './auth/WebApiAuthTransport.js';

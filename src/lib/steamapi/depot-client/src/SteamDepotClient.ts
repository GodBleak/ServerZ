import { EventEmitter } from "node:events"
import path from "node:path"
import SteamUser from "steam-user"
import { QrLoginAttempt } from "./AuthSession.js"
import { SteamCredentialStore } from "./auth/CredentialStore.js"
import { mapConcurrent } from "./download/concurrency.js"
import { BunCdnChunkDownloader } from "./download/BunCdnChunkDownloader.js"
import { closeSteamCdnCompressionWorkers, SteamCdnCompressionContext } from "./download/SteamCdnCompression.js"
import { FileHandleCache } from "./download/FileHandleCache.js"
import { isSymlink, shouldIncludeFile } from "./download/matchers.js"
import { DepotStateStore } from "./download/StateStore.js"
import { resolveDepotsFromAppInfo, resolveManifestIdFromAppInfo } from "./DepotResolver.js"
import { waitForEvent } from "./runtime/events.js"
import {
  chmodNoFollow,
  createSteamCmdSparseFile,
  createSymlinkNoFollow,
  ensureDir,
  fileSizeNoFollow,
  isElfExecutableNoFollow,
  prepareSteamCmdOutputFilePath,
  readSymlinkNoFollow,
  removeFileNoFollow,
  safeJoin,
  sha1FileNoFollow,
  toNumber,
  writeByteStream,
} from "./runtime/fs.js"
import { DepotFileFlags } from "./types.js"
import type {
  CloseOptions,
  DepotDescriptor,
  DownloadAppOptions,
  DownloadAppResult,
  DownloadAppProgress,
  DownloadAppProfile,
  DownloadDepotOptions,
  DownloadDepotResult,
  DownloadDepotSkippedResult,
  DownloadDepotProfile,
  DownloadWorkshopFileOptions,
  DownloadWorkshopFileResult,
  FileDownloadProgress,
  FileDownloadResult,
  FileValidationResult,
  ValidateAppOptions,
  ValidateAppResult,
  ValidateDepotOptions,
  ValidateDepotResult,
  LoginAnonymousOptions,
  LoginResult,
  LoginWithRefreshTokenOptions,
  LoginWithSavedCredentialsOptions,
  ProductInfoResult,
  QrChallenge,
  QrLoginOptions,
  ResolveDepotsOptions,
  ResolveManifestOptions,
  ResolveWorkshopFileOptions,
  WorkshopCycleMode,
  SteamAppInfo,
  SteamDepotFile,
  SteamDepotChunk,
  SteamContentServer,
  SteamCredentialCacheOptions,
  SteamCredentials,
  SteamDepotManifest,
  SteamProductInfo,
  SteamPublishedFileDetails,
  ResolvedWorkshopFile,
  SteamUserConnectionProtocol,
  SteamUserLike,
  DownloadBackend,
  CompressionProfile,
  LoginWithCredentialsOptions,
  SteamDepotClientOptions,
} from "./types.js"

// Default LoginID ("SK2") prevents concurrent sessions under the same account
// from kicking each other, reducing forced re-authentication cycles.
const DEFAULT_LOGON_ID = 0x534b32

interface WorkshopResolveContext {
  resolved: Map<string, ResolvedWorkshopFile>
  resolving: Set<string>
  path: string[]
  cycleMode: WorkshopCycleMode
}

export interface SteamDepotClientEvents {
  debug: [string]
  warn: [string]
  error: [Error]
  loggedOn: [unknown?]
  disconnected: [unknown?, string?]
  refreshToken: [string]
  credentialsLoaded: [SteamCredentials]
  credentialsSaved: [SteamCredentials]
  credentialsCleared: []
  qr: [QrChallenge & { attempt: QrLoginAttempt }]
  remoteInteraction: [unknown?]
  depotStart: [{ appId: number; contentAppId: number; depotId: number; branch: string; manifestId: string; fileCount: number; totalBytes: number }]
  fileStart: [FileDownloadProgress]
  fileProgress: [FileDownloadProgress]
  fileComplete: [FileDownloadResult]
  fileSkip: [FileDownloadResult]
  fileFailed: [FileDownloadResult]
  depotComplete: [DownloadDepotResult]
  depotSkip: [DownloadDepotSkippedResult]
  depotProfile: [DownloadDepotProfile]
  appProgress: [DownloadAppProgress]
  appProfile: [DownloadAppProfile]
}

export interface DepotAccessDeniedDetails {
  appId: number
  contentAppId: number
  depotId: number
  branch: string
  manifestId?: string
  operation: "depot-key" | "manifest" | "file-download"
}

export class DepotAccessDeniedError extends Error {
  readonly appId: number
  readonly contentAppId: number
  readonly depotId: number
  readonly branch: string
  readonly manifestId?: string
  readonly operation: DepotAccessDeniedDetails["operation"]

  constructor(details: DepotAccessDeniedDetails, cause: unknown) {
    const via = details.contentAppId === details.appId ? "" : ` via content app ${details.contentAppId}`
    const manifest = details.manifestId ? ` manifest ${details.manifestId}` : ""
    super(`Steam denied access to depot ${details.depotId} for app ${details.appId}${via}${manifest} while requesting ${details.operation}.`, { cause })
    this.name = "DepotAccessDeniedError"
    this.appId = details.appId
    this.contentAppId = details.contentAppId
    this.depotId = details.depotId
    this.branch = details.branch
    this.manifestId = details.manifestId
    this.operation = details.operation
  }
}

export class SteamDepotClient extends EventEmitter {
  readonly user: SteamUserLike
  readonly defaultBranch: string
  readonly credentialStore?: SteamCredentialStore
  private lastKnownCredentials?: SteamCredentials
  private readonly ownsUser: boolean
  private readonly forwardedSteamUserListeners: Array<{ event: string; listener: (...args: unknown[]) => void }> = []

  constructor(options: SteamDepotClientOptions = {}) {
    super()
    this.defaultBranch = options.defaultBranch ?? "public"
    this.credentialStore = createCredentialStore(options.dataDirectory, options.credentialCache)
    this.ownsUser = !options.user
    this.user = (options.user ??
      new SteamUser({
        enablePicsCache: true,
        renewRefreshTokens: true,
        dataDirectory: options.dataDirectory,
        protocol: resolveSteamUserConnectionProtocol(options.steamUserConnectionProtocol),
        ...(options.steamUserOptions ?? {}),
      })) as SteamUserLike

    this.forwardSteamUserEvents()
  }

  async loginAnonymous(options: LoginAnonymousOptions = {}): Promise<void> {
    this.user.logOn({
      anonymous: true,
      machineName: options.machineName,
      clientOS: options.clientOS,
    })

    await waitForEvent(this.user, "loggedOn", { timeoutMs: options.timeoutMs, rejectOnDisconnect: true })
  }

  async loginWithCredentials(accountName: string, password: string, options: LoginWithCredentialsOptions = {}): Promise<SteamCredentials> {
    let refreshToken: string | undefined
    const onRefreshToken: (...args: unknown[]) => void = (token) => {
      refreshToken = token as string
    }

    this.user.on("refreshToken", onRefreshToken)
    try {
      this.user.logOn({
        ...options,
        logonID: options.logonID ?? DEFAULT_LOGON_ID,
        accountName,
        password,
      })

      await waitForEvent(this.user, "loggedOn", { timeoutMs: options.timeoutMs, rejectOnDisconnect: true })
    } finally {
      this.removeSteamUserListener("refreshToken", onRefreshToken)
    }

    if (!refreshToken) throw new Error("Error logging in: Steam did not provide a refresh token.")

    const credentials = credentialsFromRefreshToken(refreshToken, { steamID: options.steamID })
    if (options.saveCredentials ?? true) await this.saveCredentials({ ...credentials, accountName: credentials.accountName ?? accountName })
    return credentials
  }

  async loginWithRefreshToken(refreshToken: string, options: LoginWithRefreshTokenOptions = {}): Promise<SteamCredentials | undefined> {
    let renewedRefreshToken: string | undefined
    const onRefreshToken: (...args: unknown[]) => void = (token) => {
      renewedRefreshToken = token as string
    }

    this.user.on("refreshToken", onRefreshToken)
    try {
      this.user.logOn({
        refreshToken,
        steamID: options.steamID,
        logonID: options.logonID ?? DEFAULT_LOGON_ID,
        machineName: options.machineName,
        clientOS: options.clientOS,
      })

      await waitForEvent(this.user, "loggedOn", { timeoutMs: options.timeoutMs, rejectOnDisconnect: true })
    } finally {
      this.removeSteamUserListener("refreshToken", onRefreshToken)
    }

    if (options.saveCredentials ?? true) {
      const credentials = credentialsFromRefreshToken(renewedRefreshToken ?? refreshToken, { steamID: options.steamID })
      await this.saveCredentials(credentials)
      return this.lastKnownCredentials ?? credentials
    }

    return credentialsFromRefreshToken(renewedRefreshToken ?? refreshToken, { steamID: options.steamID })
  }

  async loginWithSavedCredentials(options: LoginWithSavedCredentialsOptions = {}): Promise<SteamCredentials> {
    const credentials = options.refreshToken
      ? credentialsFromRefreshToken(options.refreshToken, { steamID: options.steamID })
      : await this.getSavedCredentials()

    if (!credentials) {
      throw new Error(
        "No cached Steam credentials found. Run loginWithQr(), call loginWithRefreshToken(), or pass STEAM_REFRESH_TOKEN once with credential caching enabled."
      )
    }

    let loggedInCredentials: SteamCredentials | undefined
    try {
      loggedInCredentials = await this.loginWithRefreshToken(credentials.refreshToken, {
        ...options,
        steamID: options.steamID ?? credentials.steamID,
        saveCredentials: options.saveCredentials ?? true,
      })
    } catch (error) {
      if (isTokenRejectionError(error)) {
        await this.clearSavedCredentials().catch(() => undefined)
        throw new Error("Saved refresh token was rejected by Steam. Cached credentials have been cleared — please re-authenticate.", { cause: error })
      }

      throw error
    }

    return {
      ...credentials,
      ...loggedInCredentials,
      updatedAt: new Date().toISOString(),
    }
  }

  async getSavedCredentials(): Promise<SteamCredentials | null> {
    if (!this.credentialStore) return null
    const credentials = await this.credentialStore.read()
    if (credentials) {
      this.lastKnownCredentials = credentials
      this.emit("credentialsLoaded", credentials)
    }

    return credentials
  }

  async saveCredentials(credentials: SteamCredentials): Promise<void> {
    if (!this.credentialStore) return

    const credsFromToken = credentialsFromRefreshToken(credentials.refreshToken)

    const normalized = {
      ...credentials,
      steamID: credentials.steamID ?? credsFromToken.steamID,
      expiresAt: credentials.expiresAt ?? credsFromToken.expiresAt,
      updatedAt: credentials.updatedAt ?? new Date().toISOString(),
    }

    await this.credentialStore.write(normalized)
    this.lastKnownCredentials = normalized
    this.emit("credentialsSaved", normalized)
  }

  async clearSavedCredentials(): Promise<void> {
    await this.credentialStore?.clear()
    this.lastKnownCredentials = undefined
    this.emit("credentialsCleared")
  }

  async beginQrLogin(options: QrLoginOptions = {}): Promise<QrLoginAttempt> {
    const attempt = await QrLoginAttempt.start(options)
    attempt.on("remoteInteraction", (payload) => this.emit("remoteInteraction", payload))
    attempt.on("error", (error) => this.emit("error", error))
    this.emit("qr", { qrChallengeUrl: attempt.qrChallengeUrl, attempt })
    return attempt
  }

  async loginWithQr(options: QrLoginOptions = {}): Promise<LoginResult> {
    const attempt = await this.beginQrLogin(options)
    const result = await attempt.waitForAuthentication()

    await this.loginWithRefreshToken(result.refreshToken, {
      steamID: result.steamID,
      logonID: options.logonID,
      machineName: options.machineName,
      clientOS: options.clientOS,
      timeoutMs: options.timeoutMs,
      saveCredentials: options.saveCredentials,
    })

    if (options.saveCredentials ?? true) {
      // loginWithRefreshToken may have already saved a renewed token with only steamID.
      // Preserve QR metadata (accountName, accessToken) and use whatever refreshToken
      // is now cached (which may be a renewed token emitted during login).
      const saved = await this.getSavedCredentials().catch(() => undefined)
      await this.saveCredentials({
        accountName: result.accountName,
        steamID: result.steamID,
        refreshToken: saved?.refreshToken ?? result.refreshToken,
        accessToken: result.accessToken,
        updatedAt: new Date().toISOString(),
      })
    }

    return result
  }

  logOff(): void {
    this.user.logOff()
  }

  async disconnect(options: CloseOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 2_000

    await new Promise<void>((resolve) => {
      let done = false
      let timer: NodeJS.Timeout | undefined

      const finish = () => {
        if (done) return
        done = true
        if (timer) clearTimeout(timer)
        if (typeof this.user.off === "function") this.user.off("disconnected", finish)
        else this.user.removeListener("disconnected", finish)
        resolve()
      }

      this.user.once("disconnected", finish)

      if (Number.isFinite(timeoutMs) && timeoutMs >= 0) timer = setTimeout(finish, timeoutMs)

      try {
        this.user.logOff()
      } catch {
        finish()
      }
    })

    if (options.force) {
      this.removeForwardedSteamUserListeners()
      if (this.ownsUser) this.user.removeAllListeners?.()
      this.removeAllListeners()
    }
  }

  async close(options: CloseOptions = {}): Promise<void> {
    await this.disconnect(options)
    await closeSteamCdnCompressionWorkers()
  }

  getProductInfo(appIds: number[], packageIds: number[] = [], options: { includeTokens?: boolean } = {}): Promise<ProductInfoResult> {
    return this.user.getProductInfo(appIds, packageIds, options.includeTokens ?? true)
  }

  async getAppInfo(appId: number, options: { includeTokens?: boolean } = {}): Promise<SteamProductInfo> {
    const productInfo = await this.getProductInfo([appId], [], options)
    const app = productInfo.apps[String(appId)]

    if (!app) throw new Error(`Steam returned no product info for app ${appId}`)

    if (app.missingToken) throw new Error(`App ${appId} requires a product access token and Steam did not return one for this account.`)

    return app
  }

  async getPublishedFileDetails(ids: Array<string | number | bigint> | string | number | bigint): Promise<Record<string, SteamPublishedFileDetails>> {
    if (typeof this.user.getPublishedFileDetails !== "function")
      throw new Error("steam-user.getPublishedFileDetails() is not available on this steam-user instance.")

    const normalized = (Array.isArray(ids) ? ids : [ids]).map(String)
    const { files } = await this.user.getPublishedFileDetails(normalized)
    return files
  }

  async resolveWorkshopFile(options: ResolveWorkshopFileOptions): Promise<ResolvedWorkshopFile> {
    const rootId = String(options.publishedFileId)
    const resolved = await this.resolveWorkshopFileRecursive(options.appId, rootId, options.includeChildren ?? true, {
      resolved: new Map(),
      resolving: new Set(),
      path: [],
      cycleMode: options.cycleMode ?? "skip",
    })

    if (!resolved) throw new Error(`Workshop collection ${rootId} only resolved to skipped cyclic references.`)

    return resolved
  }

  async downloadWorkshopFile(options: DownloadWorkshopFileOptions): Promise<DownloadWorkshopFileResult> {
    const root = await this.resolveWorkshopFile({
      appId: options.appId,
      publishedFileId: options.publishedFileId,
      includeChildren: options.includeChildren ?? true,
      cycleMode: options.workshopCycleMode ?? "skip",
    })

    const files = flattenWorkshopFiles(root).filter((file) => file.source !== "collection")
    const depots: DownloadDepotResult[] = []
    const skippedDepots: DownloadDepotSkippedResult[] = []
    const webFiles: FileDownloadResult[] = []
    const branch = options.branch ?? this.defaultBranch

    if (!options.dryRun) await ensureDir(options.directory)

    const manifestKeys = new Set(
      files
        .filter(
          (file): file is ResolvedWorkshopFile & { source: "manifest"; depotId: number; manifestId: string } =>
            file.source === "manifest" && file.depotId !== undefined && file.manifestId !== undefined
        )
        .map((file) => workshopProgressKey(file.appId, file.contentAppId ?? file.appId, file.depotId, file.manifestId))
    )
    const webFileKeys = new Set(files.filter((file) => file.source === "url").map((file) => `web:${file.publishedFileId}`))
    const depotTotals = new Map<string, number>()
    const depotDownloaded = new Map<string, number>()
    const depotCompleted = new Map<string, number>()
    const depotFailed = new Map<string, number>()
    const webTotals = new Map<string, number>()
    const webDownloaded = new Map<string, number>()
    const webCompleted = new Map<string, number>()
    const webFailed = new Map<string, number>()
    let depotsStarted = 0
    let depotsCompleted = 0
    let depotsSkipped = 0
    let depotsFailed = 0

    const emitWorkshopProgress = (activeDepotId?: number): void => {
      const totalBytesDiscovered = [...depotTotals.values(), ...webTotals.values()].reduce((sum, value) => sum + value, 0)
      const totalBytesDownloaded = [...depotDownloaded.values(), ...webDownloaded.values()].reduce((sum, value) => sum + value, 0)
      const totalBytesCompleted = [...depotCompleted.values(), ...webCompleted.values()].reduce((sum, value) => sum + value, 0)
      const totalBytesFailed = [...depotFailed.values(), ...webFailed.values()].reduce((sum, value) => sum + value, 0)
      this.emit("appProgress", {
        appId: options.appId,
        branch,
        directory: options.directory,
        source: "workshop",
        publishedFileId: String(options.publishedFileId),
        totalBytesDownloaded,
        totalBytesCompleted,
        totalBytesFailed,
        totalBytesDiscovered,
        percent: totalBytesDiscovered > 0 ? (totalBytesCompleted / totalBytesDiscovered) * 100 : null,
        depotsTotal: manifestKeys.size,
        depotsStarted,
        depotsCompleted,
        depotsSkipped,
        depotsFailed,
        activeDepotId,
      })
    }

    const onDepotStart = (event: SteamDepotClientEvents["depotStart"][0]): void => {
      const key = workshopProgressKey(event.appId, event.contentAppId, event.depotId, event.manifestId)
      if (event.branch !== branch || !manifestKeys.has(key)) return
      depotsStarted++
      depotTotals.set(key, event.totalBytes)
      depotDownloaded.set(key, depotDownloaded.get(key) ?? 0)
      depotCompleted.set(key, depotCompleted.get(key) ?? 0)
      depotFailed.set(key, depotFailed.get(key) ?? 0)
      emitWorkshopProgress(event.depotId)
    }

    const onFileProgress = (progress: FileDownloadProgress): void => {
      const key = workshopProgressKey(progress.appId, progress.contentAppId, progress.depotId, progress.manifestId)
      if (!manifestKeys.has(key)) return
      const downloaded = Math.max(depotDownloaded.get(key) ?? 0, progress.totalBytesDownloaded)
      depotDownloaded.set(key, downloaded)
      depotCompleted.set(key, Math.max(depotCompleted.get(key) ?? 0, downloaded))
      depotTotals.set(key, Math.max(depotTotals.get(key) ?? 0, progress.totalSizeBytes))
      emitWorkshopProgress(progress.depotId)
    }

    const onDepotComplete = (result: DownloadDepotResult): void => {
      const key = workshopProgressKey(result.appId, result.contentAppId, result.depotId, result.manifestId)
      if (result.branch !== branch || !manifestKeys.has(key)) return
      depotsCompleted++
      if (result.failedBytes > 0) depotsFailed++
      depotTotals.set(key, result.totalBytes)
      depotDownloaded.set(key, result.downloadedBytes)
      depotCompleted.set(key, result.completedBytes)
      depotFailed.set(key, result.failedBytes)
      emitWorkshopProgress(result.depotId)
    }

    const onDepotSkip = (result: DownloadDepotSkippedResult): void => {
      if (!result.manifestId) return
      const key = workshopProgressKey(result.appId, result.contentAppId, result.depotId, result.manifestId)
      if (!manifestKeys.has(key)) return
      depotsSkipped++
      emitWorkshopProgress(result.depotId)
    }

    this.on("depotStart", onDepotStart)
    this.on("fileProgress", onFileProgress)
    this.on("depotComplete", onDepotComplete)
    this.on("depotSkip", onDepotSkip)

    try {
      for (const file of files) {
        const itemDirectory = (options.separateItemDirectories ?? true) ? path.join(options.directory, file.publishedFileId) : options.directory

        if (file.source === "url") {
          const key = `web:${file.publishedFileId}`
          if (webFileKeys.has(key)) {
            const expectedBytes =
              optionalNonNegativeSafeInteger(file.details.file_size as string | number | bigint | undefined, `workshop file ${file.publishedFileId} size`) ?? 0
            webTotals.set(key, expectedBytes)
            webDownloaded.set(key, webDownloaded.get(key) ?? 0)
            webCompleted.set(key, webCompleted.get(key) ?? 0)
            webFailed.set(key, webFailed.get(key) ?? 0)
            emitWorkshopProgress()
          }

          try {
            const result = await this.downloadWorkshopWebFile(file, itemDirectory, {
              dryRun: options.dryRun ?? false,
              overwrite: options.overwrite ?? false,
              fetchTimeoutMs: options.workshopWebFileFetchTimeoutMs,
            })
            webFiles.push(result)
            if (webFileKeys.has(key)) {
              webTotals.set(key, result.bytes)
              if (result.status === "planned") {
                webCompleted.set(key, 0)
              } else if (result.status === "downloaded" || result.status === "skipped") {
                webDownloaded.set(key, result.status === "downloaded" ? result.bytes : 0)
                webCompleted.set(key, result.bytes)
              } else if (result.status === "failed") {
                webFailed.set(key, result.bytes)
              }
              emitWorkshopProgress()
            }
          } catch (error) {
            if (webFileKeys.has(key)) {
              webFailed.set(key, webTotals.get(key) ?? 0)
              emitWorkshopProgress()
            }
            throw error
          }
          continue
        }

        if (file.source === "manifest") {
          try {
            depots.push(
              await this.downloadDepot({
                ...options,
                appId: file.appId,
                contentAppId: file.contentAppId ?? file.appId,
                depotId: file.depotId!,
                manifestId: file.manifestId!,
                branch,
                directory: itemDirectory,
              })
            )
          } catch (error) {
            if (options.skipUnavailableDepots && error instanceof DepotAccessDeniedError) {
              const skipped: DownloadDepotSkippedResult = {
                appId: file.appId,
                contentAppId: file.contentAppId ?? file.appId,
                depotId: file.depotId!,
                branch,
                directory: itemDirectory,
                manifestId: file.manifestId,
                reason: "access-denied",
                error,
              }
              skippedDepots.push(skipped)
              this.emit("warn", skipped.error.message)
              this.emit("depotSkip", skipped)
              continue
            }

            throw error
          }
        }
      }
    } finally {
      this.off?.("depotStart", onDepotStart)
      this.off?.("fileProgress", onFileProgress)
      this.off?.("depotComplete", onDepotComplete)
      this.off?.("depotSkip", onDepotSkip)
    }

    const appProfile = shouldIncludeProfile(options.profile)
      ? finishAppProfile(
          createMutableAppProfile(options.appId, branch),
          depots.map((depot) => depot.profile).filter((profile): profile is DownloadDepotProfile => Boolean(profile)),
          depots
        )
      : undefined

    if (appProfile) this.emit("appProfile", appProfile)

    return {
      appId: options.appId,
      publishedFileId: String(options.publishedFileId),
      directory: options.directory,
      files,
      depots,
      webFiles,
      skippedDepots,
      ...(appProfile ? { profile: appProfile } : {}),
    }
  }

  async validateDepot(options: ValidateDepotOptions): Promise<ValidateDepotResult> {
    const startedAt = monotonicMs()
    const branch = options.branch ?? this.defaultBranch
    const contentAppId = options.contentAppId ?? options.appId
    let manifestId = options.manifestId
      ? String(options.manifestId)
      : await this.resolveManifestId({
          appId: options.appId,
          contentAppId,
          depotId: options.depotId,
          branch,
          branchPassword: options.branchPassword,
          includeTokens: options.includeTokens,
        })

    const manifest = await this.getManifest({
      appId: options.appId,
      contentAppId,
      depotId: options.depotId,
      branch,
      branchPassword: options.branchPassword,
      includeTokens: options.includeTokens,
      manifestId,
    })

    const selectedFiles: SteamDepotFile[] = []
    for (const file of manifest.files ?? []) if (await shouldIncludeFile(file, options)) selectedFiles.push(file)

    orderFiles(selectedFiles, options.fileOrder ?? "manifest")

    const verifyHashes = options.verifyHashes ?? true
    const validateSelectedFiles = async (): Promise<FileValidationResult[]> =>
      mapConcurrent(selectedFiles, options.maxConcurrentFiles ?? 8, async (file) => {
        const outputPath = safeJoin(options.directory, file.filename)
        return this.validateExistingFile(options.directory, outputPath, file, verifyHashes)
      })

    let files = await validateSelectedFiles()
    const repairedFiles: FileDownloadResult[] = []
    let repairAttempts = 0
    const repairInvalidFiles = options.repairInvalidFiles ?? false
    const maxRepairAttempts = Math.max(0, Math.floor(options.maxValidationRepairAttempts ?? 1))

    while (repairInvalidFiles && repairAttempts < maxRepairAttempts) {
      const failedValidations = files.filter(isRepairableValidationFailure)
      if (failedValidations.length === 0) break

      repairAttempts++
      const repairNames = new Set(failedValidations.map((result) => result.file.filename))
      this.emit("warn", `Validation found ${failedValidations.length} missing/corrupt file(s) in depot ${options.depotId}; redownloading failed file(s).`)

      const repairResult = await this.downloadDepot({
        ...options,
        ...(options.repairDownloadOptions ?? {}),
        appId: options.appId,
        contentAppId,
        depotId: options.depotId,
        branch,
        manifestId,
        directory: options.directory,
        include: [(file: SteamDepotFile) => repairNames.has(file.filename)],
        exclude: undefined,
        filter: undefined,
        overwrite: true,
        verifyExisting: false,
        verifyDownloaded: "chunks-only",
        repairInvalidFiles: false,
        maxValidationRepairAttempts: 0,
        dryRun: false,
      } as DownloadDepotOptions)

      repairedFiles.push(...repairResult.files)
      files = await validateSelectedFiles()
    }

    const totalBytes = selectedFiles.reduce((sum, file) => sum + depotFileSize(file), 0)
    const validBytes = files.filter((file) => file.status === "valid" || file.status === "unchecked").reduce((sum, file) => sum + file.expectedBytes, 0)
    const valid = files.filter((file) => file.status === "valid").length
    const missing = files.filter((file) => file.status === "missing").length
    const unchecked = files.filter((file) => file.status === "unchecked").length
    const invalid = files.length - valid - missing - unchecked

    return {
      appId: options.appId,
      contentAppId,
      depotId: options.depotId,
      branch,
      manifestId,
      directory: options.directory,
      files,
      totalBytes,
      validBytes,
      valid,
      missing,
      invalid,
      unchecked,
      repaired: repairedFiles.length,
      repairAttempts,
      repairedFiles,
      durationMs: monotonicMs() - startedAt,
    }
  }

  async validateApp(options: ValidateAppOptions): Promise<ValidateAppResult> {
    const startedAt = monotonicMs()
    const branch = options.branch ?? this.defaultBranch
    const requestedDepots = options.depots?.map((depot) => (typeof depot === "number" ? depot : depot.depotId))
    const depotOverrides = new Map(
      options.depots
        ?.filter((depot): depot is { depotId: number; manifestId?: string | number | bigint } => typeof depot !== "number")
        .map((depot) => [depot.depotId, depot.manifestId]) ?? []
    )

    const depots = await this.listDepots(options.appId, {
      ...options,
      branch,
      depots: requestedDepots,
    })

    const results = await mapConcurrent(depots, options.maxConcurrentDepots ?? 2, async (depot) => {
      try {
        return await this.validateDepot({
          ...options,
          appId: options.appId,
          contentAppId: depot.contentAppId,
          depotId: depot.depotId,
          branch,
          manifestId: depotOverrides.get(depot.depotId) ?? depot.manifestId,
          directory: options.directory,
        })
      } catch (error) {
        if (options.skipUnavailableDepots && error instanceof DepotAccessDeniedError) {
          const skipped: DownloadDepotSkippedResult = {
            appId: options.appId,
            contentAppId: depot.contentAppId,
            depotId: depot.depotId,
            branch,
            directory: options.directory,
            manifestId: error.manifestId,
            reason: "access-denied",
            error,
          }
          this.emit("warn", skipped.error.message)
          this.emit("depotSkip", skipped)
          return skipped
        }

        throw error
      }
    })

    const completedDepots = results.filter((result): result is ValidateDepotResult => !("reason" in result))
    const skippedDepots = results.filter((result): result is DownloadDepotSkippedResult => "reason" in result)

    return {
      appId: options.appId,
      branch,
      directory: options.directory,
      depots: completedDepots,
      skippedDepots,
      totalBytes: completedDepots.reduce((sum, depot) => sum + depot.totalBytes, 0),
      validBytes: completedDepots.reduce((sum, depot) => sum + depot.validBytes, 0),
      valid: completedDepots.reduce((sum, depot) => sum + depot.valid, 0),
      missing: completedDepots.reduce((sum, depot) => sum + depot.missing, 0),
      invalid: completedDepots.reduce((sum, depot) => sum + depot.invalid, 0),
      unchecked: completedDepots.reduce((sum, depot) => sum + depot.unchecked, 0),
      repaired: completedDepots.reduce((sum, depot) => sum + depot.repaired, 0),
      repairAttempts: completedDepots.reduce((sum, depot) => sum + depot.repairAttempts, 0),
      repairedFiles: completedDepots.flatMap((depot) => depot.repairedFiles),
      durationMs: monotonicMs() - startedAt,
    }
  }

  async listDepots(appId: number, options: ResolveDepotsOptions = {}): Promise<DepotDescriptor[]> {
    const app = await this.getAppInfo(appId, { includeTokens: options.includeTokens ?? true })
    return resolveDepotsFromAppInfo(appId, requireAppInfo(appId, app), {
      ...options,
      branch: options.branch ?? this.defaultBranch,
    })
  }

  async resolveManifestId(options: ResolveManifestOptions): Promise<string> {
    const branch = options.branch ?? this.defaultBranch
    const manifestAppId = options.contentAppId ?? options.appId
    const app = await this.getAppInfo(manifestAppId, { includeTokens: options.includeTokens ?? true })
    return resolveManifestIdFromAppInfo(this.user, manifestAppId, options.depotId, requireAppInfo(manifestAppId, app), branch, options.branchPassword)
  }

  async getManifest(options: ResolveManifestOptions & { manifestId?: string | number | bigint; contentAppId?: number }): Promise<SteamDepotManifest> {
    const branch = options.branch ?? this.defaultBranch
    const contentAppId = options.contentAppId ?? options.appId
    const manifestId = options.manifestId
      ? String(options.manifestId)
      : await this.resolveManifestId({
          appId: options.appId,
          contentAppId,
          depotId: options.depotId,
          branch,
          branchPassword: options.branchPassword,
          includeTokens: options.includeTokens,
        })

    try {
      const { manifest } = await this.user.getManifest(contentAppId, options.depotId, manifestId, branch, options.branchPassword)
      return manifest
    } catch (error) {
      if (isAccessDeniedError(error)) {
        throw new DepotAccessDeniedError(
          {
            appId: options.appId,
            contentAppId,
            depotId: options.depotId,
            branch,
            manifestId,
            operation: "manifest",
          },
          error
        )
      }

      throw error
    }
  }

  async downloadDepot(options: DownloadDepotOptions): Promise<DownloadDepotResult> {
    const branch = options.branch ?? this.defaultBranch
    const contentAppId = options.contentAppId ?? options.appId
    const backend = options.downloadBackend ?? "bun-cdn"
    const profile = createMutableDepotProfile(options, contentAppId, branch, backend)

    // Early check: if the caller already aborted, reject immediately.
    options.signal?.throwIfAborted()

    const signal = options.signal
    const apiTimeoutMs: number | undefined = options.apiTimeoutMs

    const withAbort = <T>(promise: Promise<T>, label: string): Promise<T> => {
      if (!signal && !apiTimeoutMs) return promise

      return new Promise<T>((resolve, reject) => {
        let timer: NodeJS.Timeout | undefined
        let settled = false

        const done = (_err?: unknown): void => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          signal?.removeEventListener("abort", onAbort)
        }

        const onAbort = (): void => {
          done()
          reject(new DOMException("The operation was aborted", "AbortError"))
        }

        if (signal) {
          if (signal.aborted) {
            reject(new DOMException("The operation was aborted", "AbortError"))
            return
          }
          signal.addEventListener("abort", onAbort)
        }

        if (apiTimeoutMs && Number.isFinite(apiTimeoutMs) && apiTimeoutMs >= 0) {
          timer = setTimeout(() => {
            if (signal) signal.removeEventListener("abort", onAbort)
            done()
            reject(new Error(`${label} timed out after ${apiTimeoutMs}ms`))
          }, apiTimeoutMs)
        }

        promise.then(
          (value) => {
            done()
            resolve(value)
          },
          (error) => {
            done()
            reject(error)
          }
        )
      })
    }

    let manifestId = ""
    let depotKey: Buffer | undefined
    await timePhase(profile, "resolveManifestMs", async () => {
      manifestId = options.manifestId
        ? String(options.manifestId)
        : await withAbort(
            this.resolveManifestId({
              appId: options.appId,
              contentAppId,
              depotId: options.depotId,
              branch,
              branchPassword: options.branchPassword,
              includeTokens: options.includeTokens,
            }),
            "resolveManifestId"
          )
    })
    profile.manifestId = manifestId

    const manifest =
      options.manifest ??
      (await timePhase(profile, "manifestMs", async () =>
        withAbort(
          this.getManifest({
            appId: options.appId,
            contentAppId,
            depotId: options.depotId,
            branch,
            branchPassword: options.branchPassword,
            includeTokens: options.includeTokens,
            manifestId,
          }),
          "getManifest"
        )
      ))

    if (!options.dryRun && !(options.skipDepotKeyCheck ?? false)) {
      depotKey = await timePhase(profile, "depotKeyMs", () =>
        withAbort(
          this.getDepotKey({
            appId: options.appId,
            contentAppId,
            depotId: options.depotId,
            branch,
            manifestId,
          }),
          "getDepotKey"
        )
      )
    }

    const selectedFiles: SteamDepotFile[] = []
    await timePhase(profile, "planMs", async () => {
      for (const file of manifest.files ?? []) if (await shouldIncludeFile(file, options)) selectedFiles.push(file)

      orderFiles(selectedFiles, options.fileOrder ?? "size-desc")
      validateDepotFileLayout(options.directory, options.depotId, selectedFiles, !options.dryRun)
    })

    profile.files.selected = selectedFiles.length
    profile.files.zeroByte = selectedFiles.filter((file) => depotFileSize(file) === 0).length

    const totalBytes = selectedFiles.reduce((sum, file) => sum + depotFileSize(file), 0)
    const stateDirectory = options.stateDirectory ?? path.join(options.directory, ".depot-client")
    const state = new DepotStateStore(stateDirectory, options.stateDirectory ? undefined : options.directory)
    let files: FileDownloadResult[] = []
    const progressByPath = new Map<string, number>()
    const lastProgressEmitByPath = new Map<string, number>()
    const progressIntervalMs = Math.max(0, options.progressIntervalMs ?? 250)
    let totalBytesDownloaded = 0

    const verifyDownloaded = options.verifyDownloaded ?? "full-file"
    const verifyExistingForSkip = options.verifyExisting ?? verifyDownloaded === "full-file"
    const repairInvalidFiles = options.repairInvalidFiles ?? verifyDownloaded === "full-file"
    const maxValidationRepairAttempts = Math.max(0, Math.floor(options.maxValidationRepairAttempts ?? 1))
    const suppressDepotLifecycleEvents = Boolean((options as DownloadDepotOptions & { internalRepairPass?: boolean }).internalRepairPass)

    if (!options.dryRun) await ensureDir(options.directory)

    if (!suppressDepotLifecycleEvents) {
      this.emit("depotStart", {
        appId: options.appId,
        contentAppId,
        depotId: options.depotId,
        branch,
        manifestId,
        fileCount: selectedFiles.length,
        totalBytes,
      })
    }

    const wrapDownloadError = (error: unknown): Error => {
      if (isAccessDeniedError(error)) {
        return new DepotAccessDeniedError(
          {
            appId: options.appId,
            contentAppId,
            depotId: options.depotId,
            branch,
            manifestId,
            operation: "file-download",
          },
          error
        )
      }

      return error instanceof Error ? error : new Error(String(error))
    }

    if (backend === "steam-user-file") {
      const results = await mapConcurrent(selectedFiles, options.maxConcurrentFiles ?? 6, async (file, fileIndex) => {
        const outputPath = safeJoin(options.directory, file.filename)
        const bytes = isSymlink(file) ? 0 : depotFileSize(file)

        if (options.dryRun) return { file, outputPath, status: "planned", bytes } satisfies FileDownloadResult

        if (isSymlink(file)) {
          const progressBase = (): Omit<FileDownloadProgress, "bytesDownloaded" | "fileSizeBytes"> => ({
            appId: options.appId,
            contentAppId,
            depotId: options.depotId,
            manifestId,
            file,
            fileIndex,
            fileCount: selectedFiles.length,
            totalBytesDownloaded,
            totalSizeBytes: totalBytes,
            outputPath,
          })

          this.emit("fileStart", { ...progressBase(), bytesDownloaded: 0, fileSizeBytes: 0 })
          await createSymlinkNoFollow(options.directory, outputPath, depotSymlinkTarget(file))
          const downloaded: FileDownloadResult = { file, outputPath, status: "downloaded", bytes: 0 }
          this.emit("fileComplete", downloaded)
          return downloaded
        }

        const isCurrent = await timePhase(profile, "existingCheckMs", () =>
          this.isExistingFileCurrent(options.directory, outputPath, file, verifyExistingForSkip)
        )
        if (!(options.overwrite ?? false) && isCurrent) {
          await applyDepotFileMode(options.directory, outputPath, file)
          const skipped: FileDownloadResult = { file, outputPath, status: "skipped", bytes }
          this.emit("fileSkip", skipped)
          return skipped
        }

        await prepareSteamCmdOutputFilePath(options.directory, outputPath)

        const progressBase = (): Omit<FileDownloadProgress, "bytesDownloaded" | "fileSizeBytes"> => ({
          appId: options.appId,
          contentAppId,
          depotId: options.depotId,
          manifestId,
          file,
          fileIndex,
          fileCount: selectedFiles.length,
          totalBytesDownloaded,
          totalSizeBytes: totalBytes,
          outputPath,
        })

        this.emit("fileStart", { ...progressBase(), bytesDownloaded: 0, fileSizeBytes: bytes })

        try {
          await timePhase(profile, "steamUserFileMs", () =>
            this.user.downloadFile(contentAppId, options.depotId, file, outputPath, (error, status) => {
              if (error) return
              if (status?.type !== "progress") return

              const currentFileBytes = status.bytesDownloaded ?? 0
              const previousFileBytes = progressByPath.get(outputPath) ?? 0
              progressByPath.set(outputPath, currentFileBytes)
              totalBytesDownloaded += Math.max(0, currentFileBytes - previousFileBytes)

              const now = Date.now()
              const lastEmitAt = lastProgressEmitByPath.get(outputPath) ?? 0
              const complete = currentFileBytes >= (status.totalSizeBytes ?? bytes)
              if (progressIntervalMs === 0 || complete || now - lastEmitAt >= progressIntervalMs) {
                lastProgressEmitByPath.set(outputPath, now)
                this.emit("fileProgress", {
                  ...progressBase(),
                  bytesDownloaded: currentFileBytes,
                  fileSizeBytes: status.totalSizeBytes ?? bytes,
                  totalBytesDownloaded,
                  totalSizeBytes: totalBytes,
                })
              }
            })
          )

          const previousFileBytes = progressByPath.get(outputPath) ?? 0
          totalBytesDownloaded += Math.max(0, bytes - previousFileBytes)
          progressByPath.set(outputPath, bytes)
          await applyDepotFileMode(options.directory, outputPath, file)

          const downloaded: FileDownloadResult = { file, outputPath, status: "downloaded", bytes }
          this.emit("fileComplete", downloaded)
          return downloaded
        } catch (error) {
          const wrappedError = wrapDownloadError(error)
          const failed: FileDownloadResult = { file, outputPath, status: "failed", bytes, error: wrappedError }
          this.emit("fileFailed", failed)

          if (options.continueOnError) return failed

          throw wrappedError
        }
      })

      files.push(...results)
    } else {
      type ManagedFileState = {
        file: SteamDepotFile
        fileIndex: number
        outputPath: string
        bytes: number
        chunks: SteamDepotChunk[]
        bytesDownloaded: number
        completedChunks: number
        result?: FileDownloadResult
        failed?: Error
      }

      type ChunkTask = {
        state: ManagedFileState
        chunk: SteamDepotChunk
      }

      const resultByIndex = new Array<FileDownloadResult>(selectedFiles.length)
      const filesToDownload: ManagedFileState[] = []
      const chunkTasks: ChunkTask[] = []
      const makeProgressBase = (state: ManagedFileState): Omit<FileDownloadProgress, "bytesDownloaded" | "fileSizeBytes"> => ({
        appId: options.appId,
        contentAppId,
        depotId: options.depotId,
        manifestId,
        file: state.file,
        fileIndex: state.fileIndex,
        fileCount: selectedFiles.length,
        totalBytesDownloaded,
        totalSizeBytes: totalBytes,
        outputPath: state.outputPath,
      })

      const emitManagedProgress = (state: ManagedFileState, force = false): void => {
        const now = Date.now()
        const lastEmitAt = lastProgressEmitByPath.get(state.outputPath) ?? 0
        const complete = state.bytesDownloaded >= state.bytes

        if (force || progressIntervalMs === 0 || complete || now - lastEmitAt >= progressIntervalMs) {
          lastProgressEmitByPath.set(state.outputPath, now)
          this.emit("fileProgress", {
            ...makeProgressBase(state),
            bytesDownloaded: state.bytesDownloaded,
            fileSizeBytes: state.bytes,
            totalBytesDownloaded,
            totalSizeBytes: totalBytes,
          })
        }
      }

      const markFailed = (state: ManagedFileState, error: unknown): FileDownloadResult => {
        const wrappedError = wrapDownloadError(error)
        if (!state.result || state.result.status !== "failed") {
          state.failed = wrappedError
          state.result = { file: state.file, outputPath: state.outputPath, status: "failed", bytes: state.bytes, error: wrappedError }
          resultByIndex[state.fileIndex] = state.result
          this.emit("fileFailed", state.result)
        }

        return state.result
      }

      const finalizeManagedFile = async (state: ManagedFileState, fileHandles?: FileHandleCache): Promise<void> => {
        if (state.result || state.failed) return

        await fileHandles?.closePath(state.outputPath)
        await applyDepotFileMode(options.directory, state.outputPath, state.file)

        // Full-file validation runs as a depot-level post-pass so invalid files can be
        // redownloaded automatically instead of failing the whole depot mid-scheduler.
        state.bytesDownloaded = state.bytes
        progressByPath.set(state.outputPath, state.bytes)
        emitManagedProgress(state, true)

        const downloaded: FileDownloadResult = { file: state.file, outputPath: state.outputPath, status: "downloaded", bytes: state.bytes }
        state.result = downloaded
        resultByIndex[state.fileIndex] = downloaded
        this.emit("fileComplete", downloaded)
      }

      for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex++) {
        const file = selectedFiles[fileIndex]!
        const outputPath = safeJoin(options.directory, file.filename)
        const bytes = isSymlink(file) ? 0 : depotFileSize(file)

        if (options.dryRun) {
          resultByIndex[fileIndex] = { file, outputPath, status: "planned", bytes }
          continue
        }

        if (isSymlink(file)) {
          const stateForSymlink: ManagedFileState = {
            file,
            fileIndex,
            outputPath,
            bytes,
            chunks: [],
            bytesDownloaded: 0,
            completedChunks: 0,
          }
          this.emit("fileStart", { ...makeProgressBase(stateForSymlink), bytesDownloaded: 0, fileSizeBytes: 0 })
          try {
            await createSymlinkNoFollow(options.directory, outputPath, depotSymlinkTarget(file))
            await finalizeManagedFile(stateForSymlink)
          } catch (error) {
            markFailed(stateForSymlink, error)
            if (!options.continueOnError) throw wrapDownloadError(error)
          }
          continue
        }

        const isCurrent = await timePhase(profile, "existingCheckMs", () =>
          this.isExistingFileCurrent(options.directory, outputPath, file, verifyExistingForSkip)
        )
        if (!(options.overwrite ?? false) && isCurrent) {
          await applyDepotFileMode(options.directory, outputPath, file)
          const skipped: FileDownloadResult = { file, outputPath, status: "skipped", bytes }
          resultByIndex[fileIndex] = skipped
          this.emit("fileSkip", skipped)
          continue
        }

        const chunks = file.chunks ?? []
        const stateForFile: ManagedFileState = {
          file,
          fileIndex,
          outputPath,
          bytes,
          chunks,
          bytesDownloaded: 0,
          completedChunks: 0,
        }

        this.emit("fileStart", { ...makeProgressBase(stateForFile), bytesDownloaded: 0, fileSizeBytes: bytes })

        try {
          if (bytes > 0 && chunks.length === 0) throw new Error(`File ${file.filename} has non-zero size but no chunks.`)

          await timePhase(profile, "createSparseFileMs", () => createSteamCmdSparseFile(outputPath, bytes, { rootDirectory: options.directory }))

          if (bytes === 0 || chunks.length === 0) {
            await finalizeManagedFile(stateForFile)
            continue
          }

          filesToDownload.push(stateForFile)
          for (const chunk of chunks) chunkTasks.push({ state: stateForFile, chunk })
        } catch (error) {
          markFailed(stateForFile, error)
          if (!options.continueOnError) throw wrapDownloadError(error)
        }
      }

      profile.chunks.total = chunkTasks.length

      if (!options.dryRun && chunkTasks.length > 0) {
        const { servers } = await timePhase(profile, "contentServersMs", () => this.user.getContentServers(contentAppId))
        if (!servers.length) throw new Error(`No content servers available for app ${contentAppId}.`)

        let serverCursor = 0
        const serverPenalties = new Map<string, number>()
        const sortedServers = (): SteamContentServer[] => [...servers].sort((a, b) => (serverPenalties.get(a.Host) ?? 0) - (serverPenalties.get(b.Host) ?? 0))
        const nextServer = (): SteamContentServer => {
          const sorted = sortedServers()
          return sorted[serverCursor++ % sorted.length]!
        }
        const penalizeServer = (server: SteamContentServer): void => {
          serverPenalties.set(server.Host, (serverPenalties.get(server.Host) ?? 0) + 1)
        }
        const maxChunkRetries = Math.max(0, Math.floor(options.maxChunkRetries ?? 5))
        const fileHandles = new FileHandleCache(options.maxOpenFileHandles ?? 64)
        const compressionContext = backend === "bun-cdn" ? new SteamCdnCompressionContext() : undefined
        let bunCdnDownloader: BunCdnChunkDownloader | undefined

        if (backend === "bun-cdn") {
          depotKey ??= await timePhase(profile, "depotKeyMs", () =>
            this.getDepotKey({
              appId: options.appId,
              contentAppId,
              depotId: options.depotId,
              branch,
              manifestId,
            })
          )

          bunCdnDownloader = new BunCdnChunkDownloader({
            user: this.user,
            appId: contentAppId,
            depotId: options.depotId,
            depotKey,
            contentServers: servers,
            fetchTimeoutMs: options.bunCdnFetchTimeoutMs,
            fallbackToSteamUser: options.bunCdnFallbackToSteamUser ?? false,
            debug: (message) => this.emit("debug", message),
            compression: {
              mode: options.bunCdnCompression ?? "auto",
              zstdBackend: options.bunCdnZstdBackend ?? "auto",
              lzmaBackend: options.bunCdnLzmaBackend ?? "auto",
              ffiLzmaWorkers: options.bunCdnFfiLzmaWorkers,
              ffiLzmaBunExecutable: options.bunCdnFfiLzmaBunExecutable,
              ffiLzmaProcessRetries: options.bunCdnFfiLzmaProcessRetries,
              ffiLzmaLibraryPath: options.bunCdnFfiLzmaLibraryPath,
              ffiLzmaMemlimitBytes: options.bunCdnFfiLzmaMemlimitBytes,
              context: compressionContext,
            },
            verifyChunks: verifyDownloaded !== "none",
            onCompression: (event) => addCompression(profile, event),
            onTiming: (stage, durationMs) => {
              if (stage === "fetch") addTiming(profile, "bunCdnFetchMs", durationMs)
              else if (stage === "decrypt") addTiming(profile, "bunCdnDecryptMs", durationMs)
              else if (stage === "decompress") addTiming(profile, "bunCdnDecompressMs", durationMs)
              else addTiming(profile, "bunCdnVerifyMs", durationMs)
            },
          })
        }

        const downloadOneChunk = async (task: ChunkTask): Promise<Buffer> => {
          let lastError: unknown

          for (let attempt = 0; attempt <= maxChunkRetries; attempt++) {
            // Backoff delay on retries: 1s, 2s, 3s, ... capped at 5s
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * attempt, 5000)))

            const server = bunCdnDownloader ? undefined : nextServer()
            const startedAt = monotonicMs()
            try {
              const chunk = bunCdnDownloader
                ? await bunCdnDownloader.downloadChunk(task.chunk.sha)
                : await this.downloadChunkWithSteamUser(contentAppId, options.depotId, task.chunk.sha, server!)
              const elapsedMs = monotonicMs() - startedAt
              addTiming(profile, "chunkDownloadMs", elapsedMs)
              profile.chunks.maxDownloadMs = Math.max(profile.chunks.maxDownloadMs, elapsedMs)

              profile.chunks.completed++
              profile.chunks.bytes += chunk.length
              return chunk
            } catch (error) {
              const elapsedMs = monotonicMs() - startedAt
              addTiming(profile, "chunkDownloadMs", elapsedMs)
              profile.chunks.maxDownloadMs = Math.max(profile.chunks.maxDownloadMs, elapsedMs)
              if (server) penalizeServer(server)
              lastError = error
              if (attempt < maxChunkRetries) profile.chunks.retries++
              else profile.chunks.failed++
            }
          }

          throw lastError instanceof Error ? lastError : new Error(String(lastError))
        }

        let managedDownloadError: unknown
        try {
          await mapConcurrent(chunkTasks, options.maxConcurrentChunks ?? 32, async (task) => {
            const stateForFile = task.state
            if (stateForFile.failed) return

            try {
              const data = await downloadOneChunk(task)
              const offset = depotChunkOffset(task.chunk, task.chunk.sha)
              const expectedChunkBytes = depotChunkOriginalSize(task.chunk, task.chunk.sha)
              if (data.length !== expectedChunkBytes) {
                throw new Error(
                  `Chunk size mismatch for ${stateForFile.file.filename} (${task.chunk.sha}): expected ${expectedChunkBytes} bytes, got ${data.length}.`
                )
              }
              const writeStartedAt = monotonicMs()
              await fileHandles.write(stateForFile.outputPath, data, offset)
              const writeElapsedMs = monotonicMs() - writeStartedAt
              addTiming(profile, "fileWriteMs", writeElapsedMs)
              profile.chunks.maxWriteMs = Math.max(profile.chunks.maxWriteMs, writeElapsedMs)

              stateForFile.completedChunks++
              stateForFile.bytesDownloaded += data.length
              const previousFileBytes = progressByPath.get(stateForFile.outputPath) ?? 0
              progressByPath.set(stateForFile.outputPath, stateForFile.bytesDownloaded)
              totalBytesDownloaded += Math.max(0, stateForFile.bytesDownloaded - previousFileBytes)
              emitManagedProgress(stateForFile)

              if (stateForFile.completedChunks >= stateForFile.chunks.length) await finalizeManagedFile(stateForFile, fileHandles)
            } catch (error) {
              const failed = markFailed(stateForFile, error)
              if (!options.continueOnError) throw failed.error ?? wrapDownloadError(error)
            }
          })
        } catch (error) {
          managedDownloadError = error
        } finally {
          await Promise.all([fileHandles.closeAll(), compressionContext?.close()])
          await cleanupFailedManagedFiles(options.directory, filesToDownload, managedDownloadError !== undefined)
        }

        if (managedDownloadError) throw managedDownloadError
      }

      // If continueOnError was enabled, chunk tasks for failed files may have been skipped while
      // other files completed. Make sure every file has a result.
      for (const stateForFile of filesToDownload) {
        if (!stateForFile.result) {
          if (stateForFile.failed) {
            resultByIndex[stateForFile.fileIndex] = {
              file: stateForFile.file,
              outputPath: stateForFile.outputPath,
              status: "failed",
              bytes: stateForFile.bytes,
              error: stateForFile.failed,
            }
          } else if (stateForFile.completedChunks >= stateForFile.chunks.length) {
            await finalizeManagedFile(stateForFile)
          }
        }
      }

      files.push(...resultByIndex.filter((result): result is FileDownloadResult => Boolean(result)))
    }

    if (!options.dryRun && verifyDownloaded === "full-file") {
      files = await this.repairInvalidDepotFiles({
        options,
        branch,
        contentAppId,
        manifestId,
        selectedFiles,
        files,
        profile,
        repairInvalidFiles,
        maxValidationRepairAttempts,
        suppressDepotLifecycleEvents,
      })
    }

    if (!options.dryRun) await timePhase(profile, "stateWriteMs", () => state.write(options.appId, options.depotId, branch, manifestId, selectedFiles))

    const profileResult = finishDepotProfile(profile, files)
    const downloadedBytes = files.filter((file) => file.status === "downloaded").reduce((sum, file) => sum + file.bytes, 0)
    const skippedBytes = files.filter((file) => file.status === "skipped").reduce((sum, file) => sum + file.bytes, 0)
    const failedBytes = files.filter((file) => file.status === "failed").reduce((sum, file) => sum + file.bytes, 0)
    const completedBytes = downloadedBytes + skippedBytes
    const result: DownloadDepotResult = {
      appId: options.appId,
      contentAppId,
      depotId: options.depotId,
      branch,
      manifestId,
      directory: options.directory,
      files,
      downloadedBytes,
      completedBytes,
      skippedBytes,
      failedBytes,
      totalBytes,
      ...(shouldIncludeProfile(options.profile) ? { profile: profileResult } : {}),
    }

    if (!suppressDepotLifecycleEvents) {
      this.emit("depotComplete", result)
      if (shouldIncludeProfile(options.profile)) this.emit("depotProfile", profileResult)
    }
    return result
  }

  async downloadApp(options: DownloadAppOptions): Promise<DownloadAppResult> {
    const appProfile = createMutableAppProfile(options.appId, options.branch ?? this.defaultBranch)
    const branch = options.branch ?? this.defaultBranch
    const requestedDepots = options.depots?.map((depot) => (typeof depot === "number" ? depot : depot.depotId))
    const depotOverrides = new Map(
      options.depots
        ?.filter((depot): depot is { depotId: number; manifestId?: string | number | bigint } => typeof depot !== "number")
        .map((depot) => [depot.depotId, depot.manifestId]) ?? []
    )

    const depots = await this.listDepots(options.appId, {
      ...options,
      branch,
      depots: requestedDepots,
    })

    const preflightManifests =
      !options.dryRun && (options.maxConcurrentDepots ?? 2) > 1
        ? await this.assertNoConcurrentDepotPathConflicts(options, depots, branch, depotOverrides)
        : new Map<number, SteamDepotManifest>()

    const depotIds = new Set(depots.map((depot) => depot.depotId))
    const depotTotals = new Map<number, number>()
    const depotDownloaded = new Map<number, number>()
    const depotCompleted = new Map<number, number>()
    const depotFailed = new Map<number, number>()
    let depotsStarted = 0
    let depotsCompleted = 0
    let depotsSkipped = 0
    let depotsFailed = 0

    const emitAppProgress = (activeDepotId?: number): void => {
      const totalBytesDiscovered = [...depotTotals.values()].reduce((sum, value) => sum + value, 0)
      const totalBytesDownloaded = [...depotDownloaded.values()].reduce((sum, value) => sum + value, 0)
      const totalBytesCompleted = [...depotCompleted.values()].reduce((sum, value) => sum + value, 0)
      const totalBytesFailed = [...depotFailed.values()].reduce((sum, value) => sum + value, 0)
      this.emit("appProgress", {
        appId: options.appId,
        branch,
        directory: options.directory,
        source: "app",
        totalBytesDownloaded,
        totalBytesCompleted,
        totalBytesFailed,
        totalBytesDiscovered,
        percent: totalBytesDiscovered > 0 ? (totalBytesCompleted / totalBytesDiscovered) * 100 : null,
        depotsTotal: depots.length,
        depotsStarted,
        depotsCompleted,
        depotsSkipped,
        depotsFailed,
        activeDepotId,
      })
    }

    const onDepotStart = (event: SteamDepotClientEvents["depotStart"][0]): void => {
      if (event.appId !== options.appId || event.branch !== branch || !depotIds.has(event.depotId)) return
      depotsStarted++
      depotTotals.set(event.depotId, event.totalBytes)
      depotDownloaded.set(event.depotId, depotDownloaded.get(event.depotId) ?? 0)
      depotCompleted.set(event.depotId, depotCompleted.get(event.depotId) ?? 0)
      depotFailed.set(event.depotId, depotFailed.get(event.depotId) ?? 0)
      emitAppProgress(event.depotId)
    }

    const onFileProgress = (progress: FileDownloadProgress): void => {
      if (progress.appId !== options.appId || !depotIds.has(progress.depotId)) return
      const downloaded = Math.max(depotDownloaded.get(progress.depotId) ?? 0, progress.totalBytesDownloaded)
      depotDownloaded.set(progress.depotId, downloaded)
      depotCompleted.set(progress.depotId, Math.max(depotCompleted.get(progress.depotId) ?? 0, downloaded))
      depotTotals.set(progress.depotId, Math.max(depotTotals.get(progress.depotId) ?? 0, progress.totalSizeBytes))
      emitAppProgress(progress.depotId)
    }

    const onDepotComplete = (result: DownloadDepotResult): void => {
      if (result.appId !== options.appId || result.branch !== branch || !depotIds.has(result.depotId)) return
      depotsCompleted++
      if (result.failedBytes > 0) depotsFailed++
      depotTotals.set(result.depotId, result.totalBytes)
      depotDownloaded.set(result.depotId, result.downloadedBytes)
      depotCompleted.set(result.depotId, result.completedBytes)
      depotFailed.set(result.depotId, result.failedBytes)
      emitAppProgress(result.depotId)
    }

    const onDepotSkip = (result: DownloadDepotSkippedResult): void => {
      if (result.appId !== options.appId || !depotIds.has(result.depotId)) return
      depotsSkipped++
      emitAppProgress(result.depotId)
    }

    this.on("depotStart", onDepotStart)
    this.on("fileProgress", onFileProgress)
    this.on("depotComplete", onDepotComplete)
    this.on("depotSkip", onDepotSkip)

    let depotResults: Array<DownloadDepotResult | DownloadDepotSkippedResult>
    try {
      depotResults = await mapConcurrent(depots, options.maxConcurrentDepots ?? 2, async (depot) => {
        try {
          return await this.downloadDepot({
            ...options,
            appId: options.appId,
            contentAppId: depot.contentAppId,
            depotId: depot.depotId,
            branch,
            manifestId: depotOverrides.get(depot.depotId) ?? depot.manifestId,
            manifest: preflightManifests.get(depot.depotId),
            directory: options.directory,
          })
        } catch (error) {
          if (options.skipUnavailableDepots && error instanceof DepotAccessDeniedError) {
            const skipped: DownloadDepotSkippedResult = {
              appId: options.appId,
              contentAppId: depot.contentAppId,
              depotId: depot.depotId,
              branch,
              directory: options.directory,
              manifestId: error.manifestId,
              reason: "access-denied",
              error,
            }
            this.emit("warn", skipped.error.message)
            this.emit("depotSkip", skipped)
            return skipped
          }

          throw error
        }
      })
    } finally {
      this.off?.("depotStart", onDepotStart)
      this.off?.("fileProgress", onFileProgress)
      this.off?.("depotComplete", onDepotComplete)
      this.off?.("depotSkip", onDepotSkip)
    }

    const completedDepots = depotResults.filter((result): result is DownloadDepotResult => !("reason" in result))
    const skippedDepots = depotResults.filter((result): result is DownloadDepotSkippedResult => "reason" in result)
    const appProfileResult = finishAppProfile(
      appProfile,
      completedDepots.map((depot) => depot.profile).filter((profile): profile is DownloadDepotProfile => Boolean(profile)),
      completedDepots
    )

    const result: DownloadAppResult = {
      appId: options.appId,
      branch,
      directory: options.directory,
      depots: completedDepots,
      skippedDepots,
      ...(shouldIncludeProfile(options.profile) ? { profile: appProfileResult } : {}),
    }

    if (shouldIncludeProfile(options.profile)) this.emit("appProfile", appProfileResult)
    return result
  }

  override on<K extends keyof SteamDepotClientEvents>(eventName: K, listener: (...args: SteamDepotClientEvents[K]) => void): this
  override on(eventName: string, listener: (...args: unknown[]) => void): this {
    return super.on(eventName, listener)
  }

  override once<K extends keyof SteamDepotClientEvents>(eventName: K, listener: (...args: SteamDepotClientEvents[K]) => void): this
  override once(eventName: string, listener: (...args: unknown[]) => void): this {
    return super.once(eventName, listener)
  }

  override emit<K extends keyof SteamDepotClientEvents>(eventName: K, ...args: SteamDepotClientEvents[K]): boolean
  override emit(eventName: string, ...args: unknown[]): boolean {
    return super.emit(eventName, ...args)
  }

  private async resolveWorkshopFileRecursive(
    appId: number,
    publishedFileId: string,
    includeChildren: boolean,
    context: WorkshopResolveContext
  ): Promise<ResolvedWorkshopFile | null> {
    const cached = context.resolved.get(publishedFileId)
    if (cached) return cached

    if (context.resolving.has(publishedFileId)) {
      const cyclePath = [...context.path, publishedFileId]
      const message = `Workshop collection cycle detected: ${cyclePath.join(" -> ")}`
      if (context.cycleMode === "throw") throw new Error(message)

      this.emit("warn", `${message}; skipping cyclic reference.`)
      return null
    }

    context.resolving.add(publishedFileId)
    context.path.push(publishedFileId)

    try {
      const detailsById = await this.getPublishedFileDetails(publishedFileId)
      const details = detailsById[publishedFileId] ?? Object.values(detailsById)[0]
      if (!details) throw new Error(`Steam returned no published-file details for ${publishedFileId}`)

      // Use Steam's published-file consumer_appid as the item's own app identity.
      // Each child's consumer_appid reflects the app the content genuinely belongs to,
      // which may differ from the caller's app when a collection spans multiple games.
      // contentAppId is used for SteamPipe content access (depot lookup, manifests).
      const resolvedAppId = toNumber(details.consumer_appid, 0) || appId
      const contentAppId = resolvedAppId
      const fileType = toNumber(details.file_type, 0)
      const childIds = (details.children ?? [])
        .map((child) => child.publishedfileid)
        .filter((id): id is string | number | bigint => id !== undefined && id !== null)
        .map(String)

      if (includeChildren && childIds.length > 0) {
        const children: ResolvedWorkshopFile[] = []
        for (const childId of childIds) {
          const child = await this.resolveWorkshopFileRecursive(appId, childId, includeChildren, context)
          if (child) children.push(child)
        }

        if (fileType === 2 || (!details.hcontent_file && !details.file_url)) {
          const resolved: ResolvedWorkshopFile = {
            publishedFileId,
            appId: resolvedAppId,
            title: typeof details.title === "string" ? details.title : undefined,
            filename: typeof details.filename === "string" ? details.filename : undefined,
            fileType,
            source: "collection",
            children,
            details,
          }
          context.resolved.set(publishedFileId, resolved)
          return resolved
        }
      }

      if (details.file_url && typeof details.file_url === "string") {
        const resolved: ResolvedWorkshopFile = {
          publishedFileId,
          appId: resolvedAppId,
          title: typeof details.title === "string" ? details.title : undefined,
          filename: typeof details.filename === "string" ? details.filename : undefined,
          fileType,
          source: "url",
          fileUrl: details.file_url,
          details,
        }
        context.resolved.set(publishedFileId, resolved)
        return resolved
      }

      if (details.hcontent_file !== undefined && String(details.hcontent_file) !== "0") {
        const resolved: ResolvedWorkshopFile = {
          publishedFileId,
          appId: resolvedAppId,
          title: typeof details.title === "string" ? details.title : undefined,
          filename: typeof details.filename === "string" ? details.filename : undefined,
          fileType,
          source: "manifest",
          contentAppId,
          depotId: await this.getWorkshopDepotId(contentAppId),
          manifestId: String(details.hcontent_file),
          details,
        }
        context.resolved.set(publishedFileId, resolved)
        return resolved
      }

      throw new Error(`Published file ${publishedFileId} did not include a file URL, hcontent_file manifest, or downloadable children.`)
    } finally {
      context.path.pop()
      context.resolving.delete(publishedFileId)
    }
  }

  private async getWorkshopDepotId(appId: number, fallbackAppId?: number): Promise<number> {
    const app = await this.getAppInfo(appId, { includeTokens: true })
    const depots = requireAppInfo(appId, app).depots as unknown as Record<string, unknown> | undefined
    const workshopDepot = toNumber(depots?.workshopdepot as string | number | bigint | undefined)
    if (workshopDepot) return workshopDepot

    if (fallbackAppId && fallbackAppId !== appId) {
      const fallbackApp = await this.getAppInfo(fallbackAppId, { includeTokens: true })
      const fallbackDepots = requireAppInfo(fallbackAppId, fallbackApp).depots as unknown as Record<string, unknown> | undefined
      const fallbackWorkshopDepot = toNumber(fallbackDepots?.workshopdepot as string | number | bigint | undefined)
      if (fallbackWorkshopDepot) return fallbackWorkshopDepot
    }

    const fallback = fallbackAppId && fallbackAppId !== appId ? ` or fallback app ${fallbackAppId}` : ""
    throw new Error(`App ${appId}${fallback} does not expose a workshopdepot in appinfo.`)
  }

  private async downloadWorkshopWebFile(
    file: ResolvedWorkshopFile,
    directory: string,
    options: { dryRun?: boolean; overwrite?: boolean; fetchTimeoutMs?: number } = {}
  ): Promise<FileDownloadResult> {
    if (!file.fileUrl) throw new Error(`Workshop file ${file.publishedFileId} has no URL.`)
    const filename = workshopWebFileBasename(file.filename, file.publishedFileId)
    const outputPath = safeJoin(directory, filename)
    const expectedBytes = optionalNonNegativeSafeInteger(
      file.details.file_size as string | number | bigint | undefined,
      `workshop file ${file.publishedFileId} size`
    )

    if (options.dryRun) {
      const plannedBytes = expectedBytes ?? 0
      return {
        file: { filename, size: plannedBytes },
        outputPath,
        status: "planned",
        bytes: plannedBytes,
      }
    }

    if (!options.overwrite && expectedBytes !== null) {
      const existingBytes = await fileSizeNoFollow(directory, outputPath).catch(() => null)
      if (existingBytes === expectedBytes) {
        const skipped: FileDownloadResult = {
          file: { filename, size: expectedBytes },
          outputPath,
          status: "skipped",
          bytes: expectedBytes,
        }
        this.emit("fileSkip", skipped)
        return skipped
      }
    }

    const controller = new AbortController()
    const timeoutMs = Math.max(1, Math.floor(options.fetchTimeoutMs ?? 15_000))
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let bytes: number

    try {
      const response = await fetch(file.fileUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(`Failed to download workshop file ${file.publishedFileId}: HTTP ${response.status} ${response.statusText}`)

      if (!response.body) throw new Error(`Failed to download workshop file ${file.publishedFileId}: response had no body.`)

      bytes = await writeByteStream(outputPath, response.body, { rootDirectory: directory })
      if (expectedBytes !== null && bytes !== expectedBytes) {
        await removeFileNoFollow(directory, outputPath).catch(() => undefined)
        throw new Error(`Workshop file ${file.publishedFileId} size mismatch: expected ${expectedBytes} bytes, got ${bytes} bytes.`)
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new Error(`Workshop file ${file.publishedFileId} request timed out after ${timeoutMs}ms`)

      throw error
    } finally {
      clearTimeout(timeout)
    }

    const result: FileDownloadResult = {
      file: { filename, size: bytes },
      outputPath,
      status: "downloaded",
      bytes,
    }
    this.emit("fileComplete", result)
    return result
  }

  private async getDepotKey(details: Omit<DepotAccessDeniedDetails, "operation">): Promise<Buffer> {
    try {
      const { key } = await this.user.getDepotDecryptionKey(details.contentAppId, details.depotId)
      return key
    } catch (error) {
      if (isAccessDeniedError(error)) throw new DepotAccessDeniedError({ ...details, operation: "depot-key" }, error)

      throw error
    }
  }

  private async downloadChunkWithSteamUser(appId: number, depotId: number, chunkSha: string, server: SteamContentServer): Promise<Buffer> {
    const response = await this.user.downloadChunk(appId, depotId, chunkSha, server)
    const maybeChunk = response as { chunk?: Buffer } | Buffer
    const chunk = Buffer.isBuffer(maybeChunk) ? maybeChunk : maybeChunk.chunk

    if (!chunk || !Buffer.isBuffer(chunk)) throw new Error("steam-user.downloadChunk() returned no chunk buffer.")

    return chunk
  }

  private async repairInvalidDepotFiles(args: {
    options: DownloadDepotOptions
    branch: string
    contentAppId: number
    manifestId: string
    selectedFiles: SteamDepotFile[]
    files: FileDownloadResult[]
    profile: MutableDepotProfile
    repairInvalidFiles: boolean
    maxValidationRepairAttempts: number
    suppressDepotLifecycleEvents: boolean
  }): Promise<FileDownloadResult[]> {
    const { options, branch, contentAppId, manifestId, selectedFiles, profile } = args
    if (selectedFiles.length === 0) return args.files

    const validations = await mapConcurrent(selectedFiles, options.maxConcurrentFiles ?? 8, async (file) => {
      const outputPath = safeJoin(options.directory, file.filename)
      return timePhase(profile, "fullFileVerifyMs", () => this.validateExistingFile(options.directory, outputPath, file, true))
    })

    const failedValidations = validations.filter(
      (result) => result.status === "missing" || result.status === "size-mismatch" || result.status === "hash-mismatch"
    )

    if (failedValidations.length === 0) return args.files

    const byFilename = new Map(args.files.map((result) => [result.file.filename, result]))

    if (!args.repairInvalidFiles || args.maxValidationRepairAttempts <= 0) {
      const message = `Full-file validation failed for ${failedValidations.length} file(s) in depot ${options.depotId}.`

      for (const validation of failedValidations) {
        const reason =
          validation.status === "hash-mismatch"
            ? `expected SHA1 ${validation.expectedSha1 ?? "(unknown)"}, got ${validation.actualSha1 ?? "(unavailable)"}`
            : `expected ${validation.expectedBytes} bytes, got ${validation.actualBytes ?? "missing"}`
        const error = validation.error ?? new Error(`Full-file validation failed for ${validation.file.filename}: ${validation.status} (${reason})`)
        const failed: FileDownloadResult = {
          file: validation.file,
          outputPath: validation.outputPath,
          status: "failed",
          bytes: validation.expectedBytes,
          error,
        }
        byFilename.set(validation.file.filename, failed)
        this.emit("fileFailed", failed)
      }

      if (!options.continueOnError) throw new Error(`${message} Set repairInvalidFiles=true or rerun downloadApp() to repair.`)

      return selectedFiles.map((file) => byFilename.get(file.filename)).filter((result): result is FileDownloadResult => Boolean(result))
    }

    const repairNames = new Set(failedValidations.map((result) => result.file.filename))
    this.emit("warn", `Full-file validation failed for ${failedValidations.length} file(s) in depot ${options.depotId}; redownloading failed file(s).`)

    const repairResult = await this.downloadDepot({
      ...options,
      appId: options.appId,
      contentAppId,
      depotId: options.depotId,
      branch,
      manifestId,
      directory: options.directory,
      include: [(file: SteamDepotFile) => repairNames.has(file.filename)],
      overwrite: true,
      verifyExisting: false,
      verifyDownloaded: "full-file",
      repairInvalidFiles: true,
      maxValidationRepairAttempts: args.maxValidationRepairAttempts - 1,
      internalRepairPass: true,
    } as DownloadDepotOptions & { internalRepairPass: boolean })

    for (const repaired of repairResult.files) byFilename.set(repaired.file.filename, repaired)

    return selectedFiles.map((file) => byFilename.get(file.filename)).filter((result): result is FileDownloadResult => Boolean(result))
  }

  private async assertNoConcurrentDepotPathConflicts(
    options: DownloadAppOptions,
    depots: DepotDescriptor[],
    branch: string,
    depotOverrides: Map<number, string | number | bigint | undefined>
  ): Promise<Map<number, SteamDepotManifest>> {
    const paths = new Map<string, { depotId: number; filename: string }>()
    const manifests = new Map<number, SteamDepotManifest>()

    for (const depot of depots) {
      const manifest = await this.getManifest({
        appId: options.appId,
        contentAppId: depot.contentAppId,
        depotId: depot.depotId,
        branch,
        branchPassword: options.branchPassword,
        includeTokens: options.includeTokens,
        manifestId: depotOverrides.get(depot.depotId) ?? depot.manifestId,
      })
      manifests.set(depot.depotId, manifest)

      for (const file of manifest.files ?? []) {
        if (!(await shouldIncludeFile(file, options))) continue

        const outputPath = safeJoin(options.directory, file.filename)
        const existing = paths.get(outputPath)
        if (existing && existing.depotId !== depot.depotId) {
          throw new Error(
            `Duplicate output path conflict across concurrent depots: ${file.filename} maps to ${outputPath} in depots ${existing.depotId} and ${depot.depotId}. Set maxConcurrentDepots=1 or choose non-overlapping depots.`
          )
        }

        paths.set(outputPath, { depotId: depot.depotId, filename: file.filename })
      }
    }

    return manifests
  }

  private async validateExistingFile(rootDirectory: string, outputPath: string, file: SteamDepotFile, verifyHash: boolean): Promise<FileValidationResult> {
    if (isSymlink(file)) {
      const expectedTarget = depotSymlinkTarget(file)
      try {
        const actualTarget = await readSymlinkNoFollow(rootDirectory, outputPath)
        if (actualTarget === null) return { file, outputPath, status: "missing", expectedBytes: 0, actualBytes: null }

        return {
          file,
          outputPath,
          status: actualTarget === expectedTarget ? "valid" : "hash-mismatch",
          expectedBytes: 0,
          actualBytes: 0,
          error:
            actualTarget === expectedTarget
              ? undefined
              : new Error(`Symlink target mismatch for ${file.filename}: expected ${expectedTarget}, got ${actualTarget}`),
        }
      } catch (error) {
        return {
          file,
          outputPath,
          status: "hash-mismatch",
          expectedBytes: 0,
          actualBytes: null,
          error: error instanceof Error ? error : new Error(String(error)),
        }
      }
    }

    const expectedBytes = depotFileSize(file)
    let actualBytes: number | null
    try {
      actualBytes = await fileSizeNoFollow(rootDirectory, outputPath)
    } catch (error) {
      return {
        file,
        outputPath,
        status: "hash-mismatch",
        expectedBytes,
        actualBytes: null,
        expectedSha1: file.sha_content,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
    const expectedSha1 = file.sha_content

    if (actualBytes === null) return { file, outputPath, status: "missing", expectedBytes, actualBytes, expectedSha1 }

    if (actualBytes !== expectedBytes) return { file, outputPath, status: "size-mismatch", expectedBytes, actualBytes, expectedSha1 }

    if (expectedBytes === 0) return { file, outputPath, status: "valid", expectedBytes, actualBytes, expectedSha1 }

    if (!verifyHash || !expectedSha1) return { file, outputPath, status: "unchecked", expectedBytes, actualBytes, expectedSha1 }

    try {
      const actualSha1 = await sha1FileNoFollow(rootDirectory, outputPath)
      return {
        file,
        outputPath,
        status: actualSha1 === expectedSha1 ? "valid" : "hash-mismatch",
        expectedBytes,
        actualBytes,
        expectedSha1,
        actualSha1,
      }
    } catch (error) {
      return {
        file,
        outputPath,
        status: "hash-mismatch",
        expectedBytes,
        actualBytes,
        expectedSha1,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  private async isExistingFileCurrent(rootDirectory: string, outputPath: string, file: SteamDepotFile, verifyExisting: boolean): Promise<boolean> {
    if (isSymlink(file)) {
      try {
        return (await readSymlinkNoFollow(rootDirectory, outputPath)) === depotSymlinkTarget(file)
      } catch {
        return false
      }
    }

    const expectedSize = depotFileSize(file)
    let existingSize: number | null
    try {
      existingSize = await fileSizeNoFollow(rootDirectory, outputPath)
    } catch {
      return false
    }
    if (existingSize === null || existingSize !== expectedSize) return false

    if (!verifyExisting || !file.sha_content || expectedSize === 0) return true
    try {
      return (await sha1FileNoFollow(rootDirectory, outputPath)) === file.sha_content
    } catch {
      return false
    }
  }

  private forwardSteamUserEvents(): void {
    this.addForwardedSteamUserListener("debug", (...args) => this.emit("debug", String(args[0])))
    this.addForwardedSteamUserListener("warn", (...args) => this.emit("warn", String(args[0])))
    this.addForwardedSteamUserListener("error", (...args) => this.emit("error", args[0] instanceof Error ? args[0] : new Error(String(args[0]))))
    this.addForwardedSteamUserListener("loggedOn", (...args) => this.emit("loggedOn", args[0]))
    this.addForwardedSteamUserListener("disconnected", (...args) => this.emit("disconnected", args[0], typeof args[1] === "string" ? args[1] : undefined))
    this.addForwardedSteamUserListener("refreshToken", (...args) => {
      const token = typeof args[0] === "string" ? args[0] : String(args[0])
      this.emit("refreshToken", token)
      const decoded = credentialsFromRefreshToken(token)
      void this.saveCredentials({
        accountName: this.lastKnownCredentials?.accountName,
        steamID: this.lastKnownCredentials?.steamID ?? decoded.steamID,
        accessToken: this.lastKnownCredentials?.accessToken,
        refreshToken: token,
        updatedAt: new Date().toISOString(),
      }).catch((error) => this.emit("error", error))
    })
  }

  private addForwardedSteamUserListener(event: string, listener: (...args: unknown[]) => void): void {
    this.forwardedSteamUserListeners.push({ event, listener })
    this.user.on(event, listener)
  }

  private removeSteamUserListener(event: string, listener: (...args: unknown[]) => void): void {
    if (typeof this.user.off === "function") this.user.off(event, listener)
    else this.user.removeListener(event, listener)
  }

  private removeForwardedSteamUserListeners(): void {
    for (const { event, listener } of this.forwardedSteamUserListeners.splice(0)) this.removeSteamUserListener(event, listener)
  }
}

type TimingKey = keyof DownloadDepotProfile["timings"]

type MutableDepotProfile = Omit<DownloadDepotProfile, "finishedAt" | "durationMs" | "timings" | "chunks" | "compression"> & {
  startedAtMs: number
  timings: DownloadDepotProfile["timings"]
  chunks: DownloadDepotProfile["chunks"]
  compression: CompressionProfile
}

type MutableAppProfile = Omit<DownloadAppProfile, "finishedAt" | "durationMs" | "depots" | "totals"> & {
  startedAtMs: number
}

function createMutableDepotProfile(options: DownloadDepotOptions, contentAppId: number, branch: string, backend: DownloadBackend): MutableDepotProfile {
  return {
    appId: options.appId,
    contentAppId,
    depotId: options.depotId,
    branch,
    manifestId: options.manifestId ? String(options.manifestId) : undefined,
    backend,
    startedAt: new Date().toISOString(),
    startedAtMs: monotonicMs(),
    timings: emptyTimings(),
    chunks: emptyChunkProfile(),
    compression: emptyCompressionProfile(),
    files: {
      selected: 0,
      planned: 0,
      skipped: 0,
      downloaded: 0,
      failed: 0,
      zeroByte: 0,
    },
  }
}

function createMutableAppProfile(appId: number, branch: string): MutableAppProfile {
  return {
    appId,
    branch,
    startedAt: new Date().toISOString(),
    startedAtMs: monotonicMs(),
  }
}

function shouldIncludeProfile(profile: DownloadDepotOptions["profile"]): boolean {
  return profile === true || profile === "summary" || profile === "verbose"
}

async function timePhase<T>(profile: MutableDepotProfile, key: TimingKey, fn: () => Promise<T> | T): Promise<T> {
  const startedAt = monotonicMs()
  try {
    return await fn()
  } finally {
    addTiming(profile, key, monotonicMs() - startedAt)
  }
}

function addTiming(profile: MutableDepotProfile, key: TimingKey, durationMs: number): void {
  profile.timings[key] += durationMs
}

function addCompression(
  profile: MutableDepotProfile,
  event: { type: keyof CompressionProfile; backend: string; compressedBytes: number; decompressedBytes: number; durationMs: number; fallback: boolean }
): void {
  const bucket = profile.compression[event.type] ?? profile.compression.unknown
  bucket.chunks++
  bucket.compressedBytes += event.compressedBytes
  bucket.decompressedBytes += event.decompressedBytes
  bucket.ms += event.durationMs
  if (event.fallback) bucket.fallbacks++
  bucket.backends[event.backend] = (bucket.backends[event.backend] ?? 0) + 1
}

function finishDepotProfile(profile: MutableDepotProfile, files: FileDownloadResult[]): DownloadDepotProfile {
  const finishedAtMs = monotonicMs()
  const timings = { ...profile.timings, totalMs: finishedAtMs - profile.startedAtMs }
  const chunks = { ...profile.chunks }
  chunks.averageDownloadMs = chunks.completed > 0 ? timings.chunkDownloadMs / chunks.completed : 0
  chunks.averageWriteMs = chunks.completed > 0 ? timings.fileWriteMs / chunks.completed : 0

  return {
    appId: profile.appId,
    contentAppId: profile.contentAppId,
    depotId: profile.depotId,
    branch: profile.branch,
    manifestId: profile.manifestId,
    backend: profile.backend,
    startedAt: profile.startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: timings.totalMs,
    timings,
    chunks,
    compression: cloneCompressionProfile(profile.compression),
    files: {
      selected: profile.files.selected,
      zeroByte: profile.files.zeroByte,
      planned: files.filter((file) => file.status === "planned").length,
      skipped: files.filter((file) => file.status === "skipped").length,
      downloaded: files.filter((file) => file.status === "downloaded").length,
      failed: files.filter((file) => file.status === "failed").length,
    },
  }
}

function finishAppProfile(appProfile: MutableAppProfile, depotProfiles: DownloadDepotProfile[], depots: DownloadDepotResult[]): DownloadAppProfile {
  const finishedAtMs = monotonicMs()
  const timings = emptyTimings()
  const chunks = emptyChunkProfile()
  const compression = emptyCompressionProfile()
  const files = {
    selected: 0,
    planned: 0,
    skipped: 0,
    downloaded: 0,
    failed: 0,
    zeroByte: 0,
  }

  for (const profile of depotProfiles) {
    for (const key of Object.keys(timings) as TimingKey[]) {
      if (key === "totalMs") continue
      timings[key] += profile.timings[key]
    }

    chunks.total += profile.chunks.total
    chunks.completed += profile.chunks.completed
    chunks.failed += profile.chunks.failed
    chunks.retries += profile.chunks.retries
    chunks.bytes += profile.chunks.bytes
    chunks.maxDownloadMs = Math.max(chunks.maxDownloadMs, profile.chunks.maxDownloadMs)
    chunks.maxWriteMs = Math.max(chunks.maxWriteMs, profile.chunks.maxWriteMs)

    files.selected += profile.files.selected
    files.planned += profile.files.planned
    files.skipped += profile.files.skipped
    files.downloaded += profile.files.downloaded
    files.failed += profile.files.failed
    files.zeroByte += profile.files.zeroByte
    mergeCompressionProfile(compression, profile.compression)
  }

  timings.totalMs = finishedAtMs - appProfile.startedAtMs
  chunks.averageDownloadMs = chunks.completed > 0 ? timings.chunkDownloadMs / chunks.completed : 0
  chunks.averageWriteMs = chunks.completed > 0 ? timings.fileWriteMs / chunks.completed : 0

  return {
    appId: appProfile.appId,
    branch: appProfile.branch,
    startedAt: appProfile.startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: timings.totalMs,
    depots: depotProfiles,
    totals: {
      downloadedBytes: depots.reduce((sum, depot) => sum + depot.downloadedBytes, 0),
      totalBytes: depots.reduce((sum, depot) => sum + depot.totalBytes, 0),
      chunks,
      files,
      timings,
      compression,
    },
  }
}

function emptyTimings(): DownloadDepotProfile["timings"] {
  return {
    resolveManifestMs: 0,
    manifestMs: 0,
    depotKeyMs: 0,
    planMs: 0,
    existingCheckMs: 0,
    createSparseFileMs: 0,
    contentServersMs: 0,
    steamUserFileMs: 0,
    chunkDownloadMs: 0,
    bunCdnFetchMs: 0,
    bunCdnDecryptMs: 0,
    bunCdnDecompressMs: 0,
    bunCdnVerifyMs: 0,
    fileWriteMs: 0,
    fullFileVerifyMs: 0,
    stateWriteMs: 0,
    totalMs: 0,
  }
}

function emptyChunkProfile(): DownloadDepotProfile["chunks"] {
  return {
    total: 0,
    completed: 0,
    failed: 0,
    retries: 0,
    bytes: 0,
    averageDownloadMs: 0,
    averageWriteMs: 0,
    maxDownloadMs: 0,
    maxWriteMs: 0,
  }
}

function emptyCompressionProfile(): CompressionProfile {
  return {
    zip: emptyCompressionBucket(),
    zstd: emptyCompressionBucket(),
    vzip: emptyCompressionBucket(),
    unknown: emptyCompressionBucket(),
  }
}

function emptyCompressionBucket(): CompressionProfile[keyof CompressionProfile] {
  return { chunks: 0, compressedBytes: 0, decompressedBytes: 0, ms: 0, fallbacks: 0, backends: {} }
}

function cloneCompressionProfile(profile: CompressionProfile): CompressionProfile {
  const clone = emptyCompressionProfile()
  mergeCompressionProfile(clone, profile)
  return clone
}

function mergeCompressionProfile(target: CompressionProfile, source: CompressionProfile): void {
  for (const key of Object.keys(target) as Array<keyof CompressionProfile>) {
    const targetBucket = target[key]
    const sourceBucket = source[key]
    targetBucket.chunks += sourceBucket.chunks
    targetBucket.compressedBytes += sourceBucket.compressedBytes
    targetBucket.decompressedBytes += sourceBucket.decompressedBytes
    targetBucket.ms += sourceBucket.ms
    targetBucket.fallbacks += sourceBucket.fallbacks
    for (const [backend, count] of Object.entries(sourceBucket.backends)) targetBucket.backends[backend] = (targetBucket.backends[backend] ?? 0) + count
  }
}

function isRepairableValidationFailure(result: FileValidationResult): boolean {
  return result.status === "missing" || result.status === "size-mismatch" || result.status === "hash-mismatch"
}

function monotonicMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

function depotFileSize(file: SteamDepotFile): number {
  if (isSymlink(file)) return 0
  return requiredNonNegativeSafeInteger(file.size, `file size for ${file.filename}`)
}

function workshopWebFileBasename(filename: string | undefined, publishedFileId: string): string {
  if (!filename) return `${publishedFileId}.bin`

  const normalized = filename.replace(/\\/g, "/")
  const basename = path.posix.basename(normalized)
  if (!basename || basename === "." || basename === ".." || basename !== filename) return `${publishedFileId}.bin`

  if (/\p{Cc}/u.test(basename)) return `${publishedFileId}.bin`

  return basename
}

function depotSymlinkTarget(file: SteamDepotFile): string {
  const target = file.linktarget
  if (typeof target !== "string" || target.length === 0) throw new Error(`Symlink file ${file.filename} is missing linktarget metadata.`)

  return target
}

function depotChunkOffset(chunk: SteamDepotChunk, label: string): number {
  return requiredNonNegativeSafeInteger(chunk.offset, `chunk offset for ${label}`)
}

function depotChunkOriginalSize(chunk: SteamDepotChunk, label: string): number {
  return requiredNonNegativeSafeInteger(chunk.cb_original, `chunk original size for ${label}`)
}

function validateDepotFileLayout(directory: string, depotId: number, files: SteamDepotFile[], validateChunks: boolean): void {
  const outputPaths = new Map<string, string>()

  for (const file of files) {
    const outputPath = safeJoin(directory, file.filename)
    const existingFilename = outputPaths.get(outputPath)
    if (existingFilename)
      throw new Error(`Duplicate output path conflict in depot ${depotId}: ${existingFilename} and ${file.filename} both map to ${outputPath}.`)

    outputPaths.set(outputPath, file.filename)

    if (!validateChunks || isSymlink(file)) continue
    validateDepotChunkLayout(file)
  }
}

function validateDepotChunkLayout(file: SteamDepotFile): void {
  const fileSize = depotFileSize(file)
  const chunks = file.chunks ?? []
  if (fileSize === 0 && chunks.length === 0) return

  const ranges = chunks
    .map((chunk) => {
      const offset = depotChunkOffset(chunk, chunk.sha)
      const length = depotChunkOriginalSize(chunk, chunk.sha)
      const end = offset + length

      if (!Number.isSafeInteger(end) || end > fileSize) {
        throw new Error(
          `Chunk layout for ${file.filename} extends past declared file size: chunk ${chunk.sha} covers ${offset}-${end}, file size is ${fileSize}.`
        )
      }

      return { offset, end, sha: chunk.sha }
    })
    .sort((a, b) => a.offset - b.offset)

  let cursor = 0
  for (const range of ranges) {
    if (range.offset < cursor) throw new Error(`Chunk layout for ${file.filename} overlaps before chunk ${range.sha}.`)

    if (range.offset > cursor)
      throw new Error(`Chunk layout for ${file.filename} has a gap before chunk ${range.sha}: expected offset ${cursor}, got ${range.offset}.`)

    cursor = range.end
  }

  if (cursor !== fileSize) throw new Error(`Chunk layout for ${file.filename} does not cover declared file size: covered ${cursor} of ${fileSize} bytes.`)
}

function requiredNonNegativeSafeInteger(value: string | number | bigint | undefined, name: string): number {
  const parsed = optionalNonNegativeSafeInteger(value, name)
  if (parsed === null) throw new Error(`Missing required ${name}.`)

  return parsed
}

function optionalNonNegativeSafeInteger(value: string | number | bigint | undefined, name: string): number | null {
  if (value === undefined || value === "") return null

  const parsed = typeof value === "bigint" ? Number(value) : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${name}: expected a non-negative safe integer, got ${String(value)}.`)

  return parsed
}

function orderFiles(files: SteamDepotFile[], order: NonNullable<DownloadDepotOptions["fileOrder"]>): void {
  if (order === "manifest") return

  files.sort((a, b) => {
    const delta = toNumber(a.size) - toNumber(b.size)
    return order === "size-asc" ? delta : -delta
  })
}

async function applyDepotFileMode(rootDirectory: string, outputPath: string, file: SteamDepotFile): Promise<void> {
  // Symlinks do not carry their own permissions on Linux; skip mode application.
  if (isSymlink(file)) return

  // Allow directory symlinks in the path for SteamCMD compatibility (e.g. linux64/ -> ../shared/),
  // but still reject file symlinks at the leaf via O_NOFOLLOW in the underlying helpers.
  const opts = { followDirectorySymlinks: true }
  const flags = file.flags ?? 0
  const executable =
    Boolean(flags & (DepotFileFlags.Executable | DepotFileFlags.CustomExecutable)) || (await isElfExecutableNoFollow(rootDirectory, outputPath, opts))

  await chmodNoFollow(rootDirectory, outputPath, executable ? 0o755 : 0o644, opts)
}

async function cleanupFailedManagedFiles(
  rootDirectory: string,
  states: Array<{ outputPath: string; failed?: Error; result?: FileDownloadResult }>,
  cleanupAllIncomplete = false
): Promise<void> {
  const failedPaths = new Set<string>()

  for (const state of states) if ((cleanupAllIncomplete || state.failed) && state.result?.status !== "downloaded") failedPaths.add(state.outputPath)

  await Promise.all([...failedPaths].map((filePath) => removeFileNoFollow(rootDirectory, filePath).catch(() => undefined)))
}

function createCredentialStore(dataDirectory: string | undefined, cacheOptions: SteamCredentialCacheOptions | undefined): SteamCredentialStore | undefined {
  if (cacheOptions === false) return undefined

  if (typeof cacheOptions === "object") {
    if (cacheOptions.enabled === false) return undefined
    if (cacheOptions.filePath) return new SteamCredentialStore({ filePath: cacheOptions.filePath })

    if (dataDirectory) return new SteamCredentialStore({ dataDirectory, fileName: cacheOptions.fileName })

    if (cacheOptions.enabled === true) throw new Error("credentialCache requires dataDirectory or credentialCache.filePath.")

    return undefined
  }

  if (cacheOptions === true) {
    if (!dataDirectory) throw new Error("credentialCache: true requires dataDirectory or credentialCache.filePath.")

    return new SteamCredentialStore({ dataDirectory })
  }

  return dataDirectory ? new SteamCredentialStore({ dataDirectory }) : undefined
}

function credentialsFromRefreshToken(refreshToken: string, extra: Partial<SteamCredentials> = {}): SteamCredentials {
  const payload = decodeJwtPayload(refreshToken)
  const steamID = extra.steamID ?? (typeof payload?.sub === "string" ? payload.sub : undefined)

  return {
    accountName: extra.accountName,
    steamID,
    refreshToken,
    accessToken: extra.accessToken,
    updatedAt: extra.updatedAt ?? new Date().toISOString(),
    expiresAt: typeof payload?.exp === "number" ? payload.exp : undefined,
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".")
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>
  } catch {
    return null
  }
}

function resolveSteamUserConnectionProtocol(mode: SteamUserConnectionProtocol = "auto"): number {
  if (mode === "tcp") return steamUserProtocol("TCP", 1)

  if (mode === "websocket") return steamUserProtocol("WebSocket", 2)

  // Bun's fetch/WebSocket TLS validation can reject Steam CM hosts whose
  // certificate SAN does not match the rotating endpoint hostname. steam-user's
  // TCP transport uses the Steam client protocol and avoids /cmsocket entirely.
  return typeof Bun !== "undefined" ? steamUserProtocol("TCP", 1) : steamUserProtocol("Auto", 0)
}

function steamUserProtocol(name: "Auto" | "TCP" | "WebSocket", fallback: number): number {
  return (SteamUser as unknown as { EConnectionProtocol?: Record<string, number> }).EConnectionProtocol?.[name] ?? fallback
}

function isAccessDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const withResult = error as Error & { eresult?: unknown; status?: unknown }
  if (withResult.eresult === 15 || error.message === "AccessDenied") return true

  // bun-cdn fetches surface Steam CDN auth failures as HTTP errors before they
  // reach steam-user's EResult wrapping. Treat CDN 403 as depot access denied so
  // skipUnavailableDepots and caller error handling see the same semantic error.
  return error.name === "CdnHttpError" && withResult.status === 403
}

// EResult codes that indicate a refresh token is no longer valid.
// InvalidPassword=5, AccessDenied=15, Expired=27, Revoked=34, InvalidSignature=57
const TOKEN_REJECTION_ERESULTS = new Set([5, 15, 27, 34, 57])

function isTokenRejectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const withResult = error as Error & { eresult?: number }
  if (withResult.eresult !== undefined && TOKEN_REJECTION_ERESULTS.has(withResult.eresult)) return true

  const msg = error.message.toLowerCase()
  return (
    msg.includes("invalidpassword") || msg.includes("access denied") || msg.includes("expired") || msg.includes("revoked") || msg.includes("invalid signature")
  )
}

function requireAppInfo(appId: number, productInfo: SteamProductInfo): SteamAppInfo {
  if (!productInfo.appinfo) throw new Error(`Steam returned product info for app ${appId}, but appinfo was empty.`)

  return productInfo.appinfo
}

function workshopProgressKey(appId: number, contentAppId: number, depotId: number, manifestId: string | number | bigint): string {
  return `${appId}:${contentAppId}:${depotId}:${String(manifestId)}`
}

function flattenWorkshopFiles(file: ResolvedWorkshopFile, seen = new Set<string>()): ResolvedWorkshopFile[] {
  if (seen.has(file.publishedFileId)) return []

  seen.add(file.publishedFileId)

  if (file.source !== "collection") return [file]
  return (file.children ?? []).flatMap((child) => flattenWorkshopFiles(child, seen))
}

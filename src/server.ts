import path from "node:path"
import { config, hasExplicitConfigValue } from "./config"
import { healthReporter } from "./healthReporter.js"
import { shutdown as shutdownProcess } from "./shutdown.js"
import type { SteamAPI } from "./lib/index.js"
import type { ContentLock, ContentLockedAppValidationResult, ContentLockedWorkshopDownloadResult } from "./lib/depot-daemon-shared/depot-daemon-api.js"
import { overlay } from "./overlay.js"
import type { DownloadAppOptions, DownloadAppProgress, DownloadWorkshopFileOptions } from "./lib/steamapi/depot-client/src/index.js"

import { gitP } from "simple-git"
import { unzip } from "unzipit"
import { logger } from "./lib/logger.js"
import { getSteamProfileManagedDefaults, type SteamProfileManagedKey } from "./lib/steamapi/config.js"
import { ExternalizedPromise } from "./lib/externalizedPromise.js"

export class Server {
  private modNameList: string[] = []
  private modNameMap: Record<number, string> = {}
  private lastSteamProgressLineAt = 0
  private contentLockHeartbeat: ReturnType<typeof setInterval> | undefined
  private contentLocksReleased = true

  constructor(private steam: SteamAPI) {}
  /**
   * Generates the command to start the server, based on configuration and mod list.
   *
   * @returns The command to start the server.
   */
  private getStartCommand(dayZBinaryPath = config.meta.dayZBinaryPath): string[] {
    const commandComponents = [dayZBinaryPath, `-config=${config.meta.configPath}`, `-port=${config.meta.port}`, `-profiles=${config.meta.profilesPath}`]
    if (this.modNameList.length > 0) commandComponents.push(`-mod=@${this.modNameList.join(";@")}`)
    commandComponents.push(`-cpuCount=${config.meta.cpuCount}`)
    if (config.meta.doLogs) commandComponents.push("-dologs")
    if (config.meta.adminLog) commandComponents.push("-adminlog")
    if (config.meta.netLog) commandComponents.push("-netlog")
    if (config.meta.freezeCheck) commandComponents.push("-freezecheck")
    if (config.meta.bePath) commandComponents.push(`-BEpath=${config.meta.bePath}`)
    if (config.meta.extraStartupArgs) {
      const args = splitShellArgs(config.meta.extraStartupArgs)

      for (const arg of args) commandComponents.push(arg)
    }
    return commandComponents
  }

  /**
   * Removes any mods from the server directory that are not included in the current mod list.
   */
  public async cleanMods() {
    if (!(await exists(config.meta.modPath))) return

    const entries = await overlay.fs.readdir(config.meta.modPath)

    type Classified = { id: number; kind: "healthy" | "dangling" }
    const classified: Classified[] = []

    for (const entry of entries) {
      const id = parseInt(entry, 10)
      if (!Number.isFinite(id)) continue

      const entryPath = `${config.meta.modPath}/${id}`
      const isLink = await linkExists(entryPath)
      if (!isLink) continue

      let target: string
      try {
        target = await overlay.fs.readlink(entryPath)
      } catch {
        classified.push({ id, kind: "healthy" })
        continue
      }

      if (await exists(target)) classified.push({ id, kind: "healthy" })
      else classified.push({ id, kind: "dangling" })
    }

    // These are never "real" mods, so we don't need (and can't get) their name
    // just unlink and forget.
    const dangling = classified.filter((c) => c.kind === "dangling")

    for (const { id } of dangling) await overlay.fs.unlink(`${config.meta.modPath}/${id}`)

    const toRemove = classified.filter((c) => c.kind === "healthy" && !config.meta.modList.includes(c.id)).map((c) => c.id)

    if (toRemove.length === 0) {
      await overlay.reloading?.promise
      await overlay.reload()
      return
    }

    const named = await Promise.all(toRemove.map(getModName))

    for (const [id, name] of named) {
      // Remove this mod's keys from the server `keys/` dir
      try {
        const keysPath = await getKeysPath(name)
        if (!keysPath) {
          logger.warn(`No keys directory found for ${name} (${id}); skipping key cleanup`)
        } else {
          const keys = await overlay.fs.readdir(keysPath)
          for (const key of keys) {
            const linked = `${config.meta.installDirectory}/keys/${name}-${key}`
            if (await exists(linked)) await overlay.fs.rm(linked)
          }
        }
      } catch (e) {
        logger.warn(`Could not enumerate keys for ${name} (${id}); skipping key cleanup: ${String(e)}`)
      }

      // Remove the @Name folder in the install dir
      const installEntry = `${config.meta.installDirectory}/@${name}`
      if (await exists(installEntry)) await overlay.fs.rm(installEntry, { recursive: true })

      // Remove the workshop entry itself
      await overlay.fs.rm(`${config.meta.modPath}/${id}`, { recursive: true })
    }

    await overlay.reloading?.promise
    await overlay.reload()
  }

  /**
   * Downloads a map from a given URL and extracts it to the maps directory.
   */
  private async downloadMap(url: string) {
    logger.info(`Downloading map from ${url}`)
    let to = config.meta.mapsPath
    if (url.startsWith("@")) {
      const [, ...restPath] = url.split("/")
      const pathSuffix = restPath.join("/")
      logger.debug(`Attempting to resolve ${url} to a mod path`)
      url = this.attemptToResolveModIDPathToActualPath(url) || url
      to = pathSuffix.length > 0 ? url.slice(0, -pathSuffix.length) : url
    }

    await download(url, to, config.meta.updateMap)
    await overlay.reloading?.promise
    await overlay.reload()
  }

  /**
   *  Moves the mission directory to the server's mpmissions directory, and symlink's it back.
   *  if `copyMission` is set to true, it will copy the mission directory instead of symlinking it.
   */
  private async updateMPMissions() {
    let destinationMissionPath = `${config.meta.installDirectory}/mpmissions/${config.server.template}`

    if (config.meta.copyMission && config.meta.copyMissionUp) {
      await overlay.fs.mkdir(`${config.meta.overridesDirectory}/mpmissions`, { recursive: true })
      destinationMissionPath = `${config.meta.overridesDirectory}/mpmissions/${config.server.template}`
    }

    const missionExists = await exists(destinationMissionPath)
    if (missionExists) return

    let missionPath = config.meta.missionPath

    if (missionPath.startsWith("@")) {
      logger.debug(`Attempting to resolve ${config.meta.missionPath} to a mod path`)
      missionPath = this.attemptToResolveModIDPathToActualPath(missionPath) || missionPath
    }

    if (config.meta.copyMission) {
      logger.info(`Copying mission from ${config.meta.missionPath} to ${destinationMissionPath}`)
      await overlay.fs.cp(missionPath, destinationMissionPath, { recursive: true })
    } else {
      logger.info(`Moving mission from ${config.meta.missionPath} to ${destinationMissionPath}`)
      await overlay.fs.rename(missionPath, destinationMissionPath)
      logger.info(`Symlinking mission from ${destinationMissionPath} back to ${missionPath}`)
      await overlay.fs.symlink(destinationMissionPath, missionPath)
    }

    await overlay.reloading?.promise
    await overlay.reload()
  }

  /**
   * Initializes the Steam session.
   */
  public async doSteamLogin() {
    if (config.steam.echoMinorRemoteSteamDetails || config.steam.steamApiAdapter === "local") this.steam.on("appProgress", this.logSteamAppProgress)
    await this.steam.login(config.steam.steamUsername, config.steam.steamPassword, config.steam.steamGuardCode)
  }

  /**
   * Downloads or updates the DayZ server files.
   */
  public async updateServer() {
    logger.info(`[DAYZ SERVER INSTALLATION] Downloading app ${config.steam.appID} to ${config.steam.downloadDirectory}`)
    const result = await this.steam.updateApp(config.steam.appID, {
      ...getSteamAppDownloadOptions(),
      directory: config.steam.downloadDirectory,
      skipUnavailableDepots: true,
    })

    if (isContentLockedAppValidationResult(result)) {
      this.handleLockedAppValidationResult(result, "[DAYZ SERVER INSTALLATION]")
      await overlay.reloading?.promise
      await overlay.reload()
      return
    }

    const totals = summarizeDownloadResult(result.depots)
    logger.info(
      `[DAYZ SERVER INSTALLATION] Installed ${result.depots.length} depot(s); ` +
        `${formatBytes(totals.completedBytes)} complete, ${formatBytes(totals.downloadedBytes)} downloaded, ${formatBytes(totals.failedBytes)} failed`
    )

    if (result.skippedDepots.length > 0) logger.warn(`[DAYZ SERVER INSTALLATION] Skipped ${result.skippedDepots.length} unavailable depot(s)`)
    await overlay.reloading?.promise
    await overlay.reload()
  }

  /**
   * Downloads/updates and installs the mods listed in the configuration.
   */
  public async updateMods() {
    if (!config.meta.modList.length) return logger.info("No mods to install")

    logger.info(`Installing ${config.meta.modList.length} workshop mod(s) to ${config.meta.modPath}`)

    for (const [index, mod] of config.meta.modList.entries()) {
      logger.info(`[MOD INSTALLATION] Downloading ${mod} (${index + 1}/${config.meta.modList.length})`)

      const result = await this.steam.workshopDownload(config.meta.modAppID, mod, {
        ...getSteamWorkshopDownloadOptions(),
        directory: config.meta.modPath,
      })

      if (isContentLockedWorkshopDownloadResult(result)) {
        this.handleLockedWorkshopDownloadResult(result)
        continue
      }

      const totals = summarizeDownloadResult(result.depots)

      logger.info(
        `[MOD INSTALLATION] Installed ${mod}; ${result.depots.length} depot manifest(s), ${result.webFiles.length} web file(s), ` +
          `${formatBytes(totals.completedBytes)} complete, ${formatBytes(totals.downloadedBytes)} downloaded`
      )

      if (result.skippedDepots.length > 0) logger.warn(`[MOD INSTALLATION] ${mod}: skipped ${result.skippedDepots.length} unavailable depot(s)`)
    }

    await overlay.reloading?.promise
    await overlay.reload()
  }

  public async loadMods() {
    if (!config.meta.modList.length) {
      this.modNameMap = {}
      this.modNameList = []
      logger.info("No mods configured")
      return
    }

    logger.info("Loading installed mods")

    const modNames = await Promise.all(config.meta.modList.map(getModName))

    this.modNameMap = Object.fromEntries(modNames)
    this.modNameList = modNames.map(([, name]) => name)

    logger.info("Creating mod folders in server directory")
    await Promise.all(modNames.map(([id, name]) => createModSymlink(id, name)))

    await overlay.reloading?.promise
    await overlay.reload()

    logger.info("Adding mod keys to server 'keys' directory")
    await Promise.all(modNames.map(([, name]) => createModKeyLinks(name)))

    await overlay.reloading?.promise
    await overlay.reload()
  }

  /**
   * Sets up a custom map and symlinks the mpmissions directory to the server directory.
   * Will also download the map if a URL is provided in the configuration.
   */
  public async updateMap() {
    await overlay.fs.mkdir(config.meta.mapsPath, { recursive: true })

    await overlay.reloading?.promise
    await overlay.reload()
    if (config.meta.mapURL) await this.downloadMap(config.meta.mapURL)
    await this.updateMPMissions()
  }

  public async applyTemplates() {
    const templatesRoot = path.resolve(import.meta.dir, "..", "templates")
    const templateDirectoryEntries = await overlay.fs.readdir(templatesRoot, { withFileTypes: true })
    const validDirectories = ["install", "overrides", "generated", "data"]

    for (const entry of templateDirectoryEntries) {
      if (!validDirectories.includes(entry.name)) continue
      switch (entry.name) {
        case "install":
          await applyTemplatesToDirectory(config.meta.installDirectory, path.join(templatesRoot, entry.name))
          break
        case "overrides":
          await applyTemplatesToDirectory(config.meta.overridesDirectory, path.join(templatesRoot, entry.name))
          break
        case "generated":
          await applyTemplatesToDirectory(config.meta.generatedConfigDirectory, path.join(templatesRoot, entry.name))
          break
        case "data":
          await applyTemplatesToDirectory(config.meta.dataDirectory, path.join(templatesRoot, entry.name))
          break
      }
    }
  }

  /**
   * Starts the DayZ server.
   *
   * The server is spawned in the `serverDirectory` and detached from the current process.
   * @returns The spawned server process.
   */
  public async start() {
    await this.registerContentLocks()

    const command = this.getStartCommand()
    logger.info(`Starting server with command: ${command.join(" ")}\n\n`)
    const server = Bun.spawn(command, {
      detached: true,
      cwd: config.meta.serverDirectory,
      stdio: ["inherit", "inherit", "inherit"],
    })

    logger.info(`Reins passed to DayZServer(${server.pid}). Good luck, Survivor!\n\n`)
    healthReporter.start()

    let sigkillTimeoutPromise: ExternalizedPromise<void> | null = null
    let sigkillTimeout: NodeJS.Timeout | undefined

    void server.exited.then(async (code) => {
      if (sigkillTimeoutPromise !== null) sigkillTimeoutPromise.resolve()
      if (sigkillTimeout) clearTimeout(sigkillTimeout)
      healthReporter.stop()
      this.stopContentLockHeartbeat()
      await this.releaseContentLocks()
      await overlay.reloading?.promise

      logger.info(`DayZServer(${server.pid}) exited with code ${code}`)
      if (!config.meta.exitWithChild) return

      await shutdownProcess(code, "child exited")
    })

    const shutdownChild = async (signal: "SIGTERM" | "SIGINT") => {
      healthReporter.stop()
      this.stopContentLockHeartbeat()
      await overlay.reloading?.promise
      sigkillTimeoutPromise = sigkillTimeoutPromise ?? new ExternalizedPromise()
      logger.info(`Received ${signal}, forwarding to DayZServer...`)
      server.kill(signal)
      sigkillTimeout = sigkillTimeout ?? setTimeout(() => sigkillTimeoutPromise?.resolve(), config.meta.shutdownTimeoutMs)
      const result = await Promise.race([server.exited.then(() => "exited" as const), sigkillTimeoutPromise?.promise.then(() => "timeout" as const)])
      if (result === "timeout") {
        try {
          server.kill("SIGKILL")
          logger.warn(`DayZServer ignored signal. Resorted to SIGKILL.`)
        } catch {
          logger.error(`Failed to kill DayZServer(${server.pid})`)
        }
      }
      if (sigkillTimeout) clearTimeout(sigkillTimeout)
      const code = await server.exited.catch(() => 1)
      await this.releaseContentLocks()
      await shutdownProcess(typeof code === "number" ? code : 1, signal)
    }

    process.once("SIGTERM", () => void shutdownChild("SIGTERM"))
    process.once("SIGINT", () => void shutdownChild("SIGINT"))

    return server
  }

  private async registerContentLocks(): Promise<void> {
    if (!this.steam.registerContentLocks || !this.steam.heartbeatContentLocks) return

    const consumerId = getContentConsumerId()
    const content = this.getContentLocks()
    if (content.length === 0) return

    await this.steam.registerContentLocks(consumerId, content, config.steam.steamContentLockTtlMs)
    this.contentLocksReleased = false
    logger.info(`Registered ${content.length} depot-daemon content lock(s) for ${consumerId}`)

    this.stopContentLockHeartbeat()
    this.contentLockHeartbeat = setInterval(() => {
      void this.steam.heartbeatContentLocks?.(consumerId, config.steam.steamContentLockTtlMs).catch((error) => {
        logger.warn(`Failed to refresh depot-daemon content locks for ${consumerId}: ${String(error)}`)
      })
    }, config.steam.steamContentLockHeartbeatMs)
  }

  private async releaseContentLocks(): Promise<void> {
    if (!this.steam.releaseContentLocks || this.contentLocksReleased) return

    const consumerId = getContentConsumerId()
    try {
      await this.steam.releaseContentLocks(consumerId)
      this.contentLocksReleased = true
      logger.info(`Released depot-daemon content locks for ${consumerId}`)
    } catch (error) {
      logger.warn(`Failed to release depot-daemon content locks for ${consumerId}: ${String(error)}`)
    }
  }

  private stopContentLockHeartbeat(): void {
    if (!this.contentLockHeartbeat) return
    clearInterval(this.contentLockHeartbeat)
    this.contentLockHeartbeat = undefined
  }

  private getContentLocks(): ContentLock[] {
    return [
      { type: "app", appId: config.steam.appID },
      ...config.meta.modList.map((workshopId) => ({ type: "workshop" as const, appId: config.meta.modAppID, workshopId })),
    ]
  }

  private handleLockedAppValidationResult(result: ContentLockedAppValidationResult, label: string): void {
    const drift = result.validation.missing + result.validation.invalid
    const consumers = result.activeConsumers.join(", ")
    const message =
      `${label} App ${result.content.appId} is locked by ${result.activeConsumers.length} active consumer(s) (${consumers}); ` +
      `validated read-only with repair suppressed. Missing: ${result.validation.missing}; invalid: ${result.validation.invalid}; unchecked: ${result.validation.unchecked}.`

    if (drift > 0 && config.steam.steamRemoteValidationFailure === "fail") throw new Error(message)
    if (drift > 0) logger.warn(message)
    else logger.info(message)
  }

  private handleLockedWorkshopDownloadResult(result: ContentLockedWorkshopDownloadResult): void {
    const consumers = result.activeConsumers.join(", ")
    logger.warn(
      `[MOD INSTALLATION] Workshop ${result.content.workshopId} for app ${result.content.appId} is locked by ` +
        `${result.activeConsumers.length} active consumer(s) (${consumers}); skipped download/repair to avoid mutating live content.`
    )
  }

  private attemptToResolveModIDPathToActualPath(path: string): string | null {
    if (!path.startsWith("@")) return null

    path = path.substring(1)
    const identifier = path.split("/")[0]
    let modName: string
    if (!Number.isNaN(Number(identifier))) modName = this.modNameMap[identifier]
    else modName = identifier

    if (!modName || String(modName).length < 1) throw new Error(`Could not find mod name for identifier ${identifier}`)

    path = `${config.meta.installDirectory}/@${modName}/${path.substring(identifier.length + 1)}`
    logger.debug(`Resolved ${config.meta.missionPath} to ${path}`)
    return path
  }

  private logSteamAppProgress = (progress: DownloadAppProgress) => {
    const now = Date.now()
    if (now - this.lastSteamProgressLineAt < config.steam.progressPrintIntervalMs) return
    this.lastSteamProgressLineAt = now

    const pct = progress.percent === null ? "?.?" : progress.percent.toFixed(1)
    const active = progress.activeDepotId ? ` active depot ${progress.activeDepotId}` : ""
    const label =
      progress.source === "workshop"
        ? `[MOD DOWNLOAD] workshop ${progress.publishedFileId ?? "unknown"} content app ${progress.appId}`
        : `[STEAM DOWNLOAD] app ${progress.appId}`

    logger.info(
      `${label} ${pct}% ${formatBytes(progress.totalBytesCompleted)} / ${formatBytes(progress.totalBytesDiscovered)} complete, ` +
        `${formatBytes(progress.totalBytesDownloaded)} downloaded, ${formatBytes(progress.totalBytesFailed)} failed, ` +
        `depots ${progress.depotsCompleted}/${progress.depotsTotal}${active}`
    )
  }
}

function getSteamAppDownloadOptions(profile = config.steam.appDownloadProfile): Omit<DownloadAppOptions, "appId" | "directory"> {
  const profileDefaults = getSteamProfileManagedDefaults(profile)

  return {
    branch: config.steam.branch,
    branchPassword: config.steam.branchPassword,
    os: config.steam.os,
    arch: config.steam.arch,
    language: config.steam.language,
    downloadBackend: getProfileManagedSteamValue("downloadBackend", profileDefaults.downloadBackend),
    maxConcurrentChunks: getProfileManagedSteamValue("maxConcurrentChunks", profileDefaults.maxConcurrentChunks),
    maxOpenFileHandles: getProfileManagedSteamValue("maxOpenFileHandles", profileDefaults.maxOpenFileHandles),
    bunCdnFetchTimeoutMs: getProfileManagedSteamValue("bunCdnFetchTimeoutMs", profileDefaults.bunCdnFetchTimeoutMs),
    bunCdnFallbackToSteamUser: config.steam.bunCdnFallbackToSteamUser,
    bunCdnCompression: config.steam.bunCdnCompression,
    bunCdnZstdBackend: config.steam.bunCdnZstdBackend,
    bunCdnLzmaBackend: config.steam.bunCdnLzmaBackend,
    bunCdnFfiLzmaBunExecutable: config.steam.bunExecutable,
    bunCdnFfiLzmaWorkers: config.steam.ffiLzmaWorkers,
    bunCdnFfiLzmaProcessRetries: config.steam.ffiLzmaProcessRetries,
    bunCdnFfiLzmaLibraryPath: config.steam.ffiLzmaLibraryPath,
    bunCdnFfiLzmaMemlimitBytes: config.steam.ffiLzmaMemlimitBytes,
    verifyDownloaded: config.steam.verifyDownloaded,
    verifyExisting: config.steam.verifyExisting,
    repairInvalidFiles: config.steam.repairInvalidFiles,
    maxValidationRepairAttempts: config.steam.maxValidationRepairAttempts,
    maxConcurrentFiles: getProfileManagedSteamValue("maxConcurrentFiles", profileDefaults.maxConcurrentFiles),
    maxConcurrentDepots: getProfileManagedSteamValue("maxConcurrentDepots", profileDefaults.maxConcurrentDepots),
    progressIntervalMs: config.steam.progressIntervalMs,
  }
}

function getSteamWorkshopDownloadOptions(): Omit<DownloadWorkshopFileOptions, "appId" | "publishedFileId" | "directory"> {
  return {
    ...getSteamAppDownloadOptions(config.steam.workshopDownloadProfile),
    includeChildren: config.steam.workshopIncludeChildren,
    separateItemDirectories: config.steam.workshopSeparateItemDirectories,
    workshopCycleMode: config.steam.workshopCycleMode,
  }
}

function getProfileManagedSteamValue<K extends SteamProfileManagedKey>(key: K, fallback: (typeof config.steam)[K]): (typeof config.steam)[K] {
  if (hasExplicitConfigValue(["steam", key])) return config.steam[key]
  return fallback
}

function isContentLockedAppValidationResult(value: unknown): value is ContentLockedAppValidationResult {
  return typeof value === "object" && value !== null && (value as { contentLocked?: unknown; operation?: unknown }).contentLocked === true && (value as { operation?: unknown }).operation === "updateApp"
}

function isContentLockedWorkshopDownloadResult(value: unknown): value is ContentLockedWorkshopDownloadResult {
  return typeof value === "object" && value !== null && (value as { contentLocked?: unknown; operation?: unknown }).contentLocked === true && (value as { operation?: unknown }).operation === "workshopDownload"
}

function getContentConsumerId(): string {
  return config.steam.steamContentConsumerId?.trim() || `serverz:${Bun.env.HOSTNAME ?? "unknown"}:${config.steam.appID}`
}

function summarizeDownloadResult(depots: Array<{ downloadedBytes: number; completedBytes: number; failedBytes: number }>) {
  return depots.reduce(
    (totals, depot) => ({
      downloadedBytes: totals.downloadedBytes + depot.downloadedBytes,
      completedBytes: totals.completedBytes + depot.completedBytes,
      failedBytes: totals.failedBytes + depot.failedBytes,
    }),
    { downloadedBytes: 0, completedBytes: 0, failedBytes: 0 }
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`
  return `${bytes} B`
}

/**
 *  Checks if a file or directory exists.
 * @param {string} path - The path to check.
 * @returns {Promise<boolean>} A promise that resolves with a boolean indicating whether the file or directory exists.
 */
async function exists(path: string): Promise<boolean> {
  return await overlay.fs
    .stat(path)
    .then(() => true)
    .catch(() => false)
}

/**
 *  Checks if a link exists.
 * @param {string} path - The path to check.
 * @returns {Promise<boolean>} A promise that resolves with a boolean indicating whether the link exists.
 */
async function linkExists(path: string): Promise<boolean> {
  return await overlay.fs
    .lstat(path)
    .then((r) => r.isSymbolicLink())
    .catch(() => false)
}

/**
 * Fetches the name of a mod by reading its metadata file.
 * @param {number} id The mod's ID.
 * @returns {Promise<[number, string]>} A promise that resolves with the mod ID and name.
 */
async function getModName(id: number): Promise<[id: number, name: string]> {
  let pathToMod = `${config.meta.modPath}/${id}`
  try {
    const isLink = await linkExists(pathToMod)
    if (isLink) pathToMod = await overlay.fs.readlink(pathToMod)
  } catch (error) {
    logger.debug(`Link check failed for ${pathToMod}:`, error)
  }

  try {
    const meta = await overlay.fs.readFile(`${pathToMod}/meta.cpp`)
    const name = meta.toString().match(/^\s*name\s*=\s*"([^"]+)"\s*;/m)
    if (!name) throw new Error(`Could not get metadata for mod ${id}`)
    return [id, name[1]]
  } catch (e) {
    throw new Error(`Could not get metadata for mod ${id}: ${String(e)}`, { cause: e })
  }
}

/**
 * Moves a mod's folder from the workshop directory to the server directory, named by mod name rather than ID. The relocated folder is symlinked back to the workshop directory.
 *
 * @param {number} id The mod's ID.
 * @param {string} name The mod's name.
 */
async function createModSymlink(id: number, name: string) {
  const sourcePath = `${config.meta.modPath}/${id}`
  const targetPath = `${config.meta.installDirectory}/@${name}`
  const targetExists = await exists(targetPath)
  if (!targetExists) {
    await overlay.fs.rename(sourcePath, targetPath)
    await overlay.fs.symlink(targetPath, sourcePath)
  }
}

/**
 * Creates links for all keys within a mod's keys directory to the server's keys directory.
 *
 * @param {number} name The mod's name.
 */
async function createModKeyLinks(name: string) {
  await overlay.fs.mkdir(`${config.meta.installDirectory}/keys`, { recursive: true })
  const keysPath = await getKeysPath(name)
  if (!keysPath) {
    logger.warn(`No keys directory found for mod ${name}; skipping key linking`)
    return
  }
  const keys = await overlay.fs.readdir(keysPath)

  for (const key of keys) {
    const sourcePath = `${keysPath}/${key}`
    const targetPath = `${config.meta.installDirectory}/keys/${name}-${key}`
    const targetExists = await exists(targetPath)
    if (targetExists) continue
    await overlay.fs.link(sourcePath, targetPath)
  }
}

/**
 * Fetches the correct path to a mod's keys directory.
 *
 * @param {number} name The mod's name.
 * @returns The path to the mod's keys directory, or null if no keys directory exists.
 */
async function getKeysPath(name: string) {
  // Some mods use "keys" and others use "Keys" 🤬
  const modDir = await overlay.fs.readdir(`${config.meta.installDirectory}/@${name}`)
  let keysDir: "keys" | "Keys" | undefined = modDir.find((dir) => dir === "keys")
  if (!keysDir) keysDir = modDir.find((dir) => dir === "Keys")
  if (!keysDir) return null
  return `${config.meta.installDirectory}/@${name}/${keysDir}`
}

/**
 * Downloads a file from a given URL and extracts it to a given directory.
 * Handles git repositories and zip files.
 *
 * @param from - The URL to clone/download from.
 * @param to - The directory to extract to.
 * @param overwrite - Whether to overwrite or update existing files.
 */
async function download(from: string, to: string, overwrite: boolean) {
  const url = from.endsWith("/") ? from.slice(0, -1) : from
  const extension = url.endsWith(".git") ? "git" : url.endsWith(".zip") ? "zip" : "unknown"
  if (extension === "git") return await getWithGit(url, to, overwrite)
  else if (extension === "zip") return await getAndExtractZip(url, to, overwrite)
  else throw new Error(`Unsupported map download type: ${extension}`)
}

/**
 * Clones a git repository to a given directory, or pulls if it already exists and `update` is true.
 *
 * @param from - The URL to clone from.
 * @param to - The directory to clone to.
 * @param update - Whether to pull if the directory already exists.
 * @returns
 */
async function getWithGit(from: string, to: string, update: boolean) {
  const repo = from.split("/").pop()
  const repoName = repo?.replace(/\.git$/, "")
  const targetDir = `${to}/${repoName}`
  const targetDirExists = await exists(targetDir)
  if (targetDirExists) {
    if (!update) return
    const git = gitP({
      baseDir: targetDir,
    })
    return await git.pull()
  } else {
    const git = gitP({
      baseDir: to,
    })
    return await git.clone(from)
  }
}

/**
 * Downloads a zip file from a given URL and extracts it to a given directory.
 *
 * @param from - The URL to download from.
 * @param to - The directory to extract to.
 * @param overwrite - Whether to overwrite existing files.
 */
async function getAndExtractZip(from: string, to: string, overwrite: boolean) {
  const targetRoot = path.resolve(to)
  await overlay.fs.mkdir(targetRoot, { recursive: true })

  const zipBuffer = await readZipSource(from)
  const { entries } = await unzip(zipBuffer)

  const entryKeys = Object.keys(entries).filter((key) => key.length > 0)

  /*
   * If the archive has one top-level directory and it already exists, preserve
   * the old behavior: skip extraction unless overwrite/update was requested.
   */
  if (!overwrite) {
    const topLevelDirs = new Set(entryKeys.map((key) => normalizeZipEntryPath(key).split("/")[0]).filter(Boolean))

    if (topLevelDirs.size === 1) {
      const [rootDir] = [...topLevelDirs]
      const rootPath = resolveZipEntryPath(targetRoot, rootDir)
      if (await exists(rootPath)) return
    }
  }

  for (const key of entryKeys) {
    const entry = entries[key]
    const normalizedKey = normalizeZipEntryPath(key)
    const fullPath = resolveZipEntryPath(targetRoot, normalizedKey)

    if (entry.isDirectory) {
      await overlay.fs.mkdir(fullPath, { recursive: true })
      continue
    }

    const parentDir = path.dirname(fullPath)
    await overlay.fs.mkdir(parentDir, { recursive: true })

    if (!overwrite && (await exists(fullPath))) continue

    const file = await entry.arrayBuffer()
    await overlay.fs.writeFile(fullPath, new Uint8Array(file))
  }
}

async function readZipSource(from: string): Promise<Uint8Array> {
  if (from.startsWith("http://") || from.startsWith("https://")) {
    const response = await fetch(from)

    if (!response.ok) throw new Error(`Failed to download zip from ${from}: ${response.status} ${response.statusText}`)

    return new Uint8Array(await response.arrayBuffer())
  }

  const file = await overlay.fs.readFile(from)
  return new Uint8Array(file.buffer, file.byteOffset, file.byteLength)
}

function normalizeZipEntryPath(entryPath: string): string {
  return entryPath.replace(/\\/g, "/").replace(/^\/+/, "")
}

function resolveZipEntryPath(targetRoot: string, entryPath: string): string {
  const normalized = normalizeZipEntryPath(entryPath)

  if (!normalized || normalized === "." || normalized.includes("\0")) throw new Error(`Refusing to extract unsafe zip entry: ${entryPath}`)

  const resolved = path.resolve(targetRoot, normalized)

  if (resolved !== targetRoot && !resolved.startsWith(targetRoot + path.sep))
    throw new Error(`Refusing to extract zip entry outside target directory: ${entryPath}`)

  return resolved
}

function splitShellArgs(input: string): string[] {
  const args: string[] = []
  let current = ""
  let inSingle = false
  let inDouble = false
  let hasContent = false // distinguishes empty arg "" from no arg

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "\\" && i + 1 < input.length && !inSingle) {
      current += input[++i]
      hasContent = true
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      hasContent = true
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      hasContent = true
    } else if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (hasContent) {
        args.push(current)
        current = ""
        hasContent = false
      }
    } else {
      current += ch
      hasContent = true
    }
  }
  if (hasContent) args.push(current)
  if (inSingle || inDouble) throw new Error("Unterminated quote in extraStartupArgs")
  return args
}

async function applyTemplatesToDirectory(directory: string, templateDirectory: string, relativePath = "") {
  const currentDirectory = path.join(templateDirectory, relativePath)
  const templateDirectoryEntries = await overlay.fs.readdir(currentDirectory, { withFileTypes: true })

  for (const entry of templateDirectoryEntries) {
    const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      await applyTemplatesToDirectory(directory, templateDirectory, entryRelativePath)
      continue
    }

    if (!entry.isFile()) continue
    if (!entry.name.endsWith(".tsx")) continue

    const template = await import(`${templateDirectory}/${entryRelativePath}`)
    const generated = await template.generate(config)
    if (!generated) continue
    if (typeof generated !== "string") continue
    if (generated.trim().length === 0) continue

    const outputRelativePath = entryRelativePath.slice(0, -".tsx".length)
    const destination = resolveTemplateDestination(directory, outputRelativePath)

    await overlay.fs.mkdir(path.dirname(destination), { recursive: true })
    await overlay.fs.writeFile(destination, generated)
    await overlay.reloading?.promise
    await overlay.reload()
    logger.info(`Applied template ${outputRelativePath} to ${path.dirname(destination)}`)
  }
}

function resolveTemplateDestination(layerTarget: string, outputRelativePath: string): string {
  const [head, ...rest] = outputRelativePath.split("/")
  if (head === "battleye" && rest.length > 0) return path.join(config.meta.bePath, ...rest)
  return path.join(layerTarget, outputRelativePath)
}

import type {
  ContentLock,
  ContentLockResponse,
  UpdateAppResponse,
  WorkshopDownloadResponse,
} from "../depot-daemon-shared/depot-daemon-api.js"
import type {
  DownloadAppOptions,
  DownloadWorkshopFileOptions,
  SteamDepotClientEvents,
  ValidateAppOptions,
  ValidateAppResult,
} from "./depot-client/src"

export type SteamEventName = keyof SteamDepotClientEvents

export interface SteamAPI {
  login(username?: string, password?: string, code?: string): Promise<void>
  updateApp(appId: number, options: Omit<DownloadAppOptions, "appId">): Promise<UpdateAppResponse>
  verify(appId: number, options: Omit<ValidateAppOptions, "appId">): Promise<ValidateAppResult>
  workshopDownload(
    appId: number,
    workshopId: number,
    options: Omit<DownloadWorkshopFileOptions, "appId" | "publishedFileId">
  ): Promise<WorkshopDownloadResponse>
  on<K extends SteamEventName>(eventName: K, listener: (...args: SteamDepotClientEvents[K]) => void): unknown
  once<K extends SteamEventName>(eventName: K, listener: (...args: SteamDepotClientEvents[K]) => void): unknown
  registerContentLocks?(consumerId: string, content: ContentLock[], ttlMs: number): Promise<ContentLockResponse>
  heartbeatContentLocks?(consumerId: string, ttlMs: number): Promise<ContentLockResponse>
  releaseContentLocks?(consumerId: string): Promise<ContentLockResponse>
  off<K extends SteamEventName>(eventName: K, listener: (...args: SteamDepotClientEvents[K]) => void): unknown
}

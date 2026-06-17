import type {
  DownloadAppOptions,
  DownloadAppResult,
  DownloadWorkshopFileOptions,
  DownloadWorkshopFileResult,
  SteamDepotClientEvents,
  ValidateAppOptions,
  ValidateAppResult,
} from "./depot-client/src"

export type SteamEventName = keyof SteamDepotClientEvents

export interface SteamAPI {
  login(username?: string, password?: string, code?: string): Promise<void>
  updateApp(appId: number, options: Omit<DownloadAppOptions, "appId">): Promise<DownloadAppResult>
  verify(appId: number, options: Omit<ValidateAppOptions, "appId">): Promise<ValidateAppResult>
  workshopDownload(
    appId: number,
    workshopId: number,
    options: Omit<DownloadWorkshopFileOptions, "appId" | "publishedFileId">
  ): Promise<DownloadWorkshopFileResult>
  on<K extends SteamEventName>(eventName: K, listener: (...args: SteamDepotClientEvents[K]) => void): unknown
  once<K extends SteamEventName>(eventName: K, listener: (...args: SteamDepotClientEvents[K]) => void): unknown
  off<K extends SteamEventName>(eventName: K, listener: (...args: SteamDepotClientEvents[K]) => void): unknown
}

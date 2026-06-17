declare module 'steam-user' {
  import { EventEmitter } from 'node:events'

  export default class SteamUser extends EventEmitter {
    static EResult: Record<string, number>
    static EAuthSessionGuardType: Record<string, number>
    constructor(options?: Record<string, unknown>)
    logOn(details: Record<string, unknown>): void
    logOff(): void
    disconnect(): void
    setPersona(state: number): void
    getProductInfo(apps: unknown[], packages: unknown[], callback: (...args: unknown[]) => void): void
    getProductChanges(...args: unknown[]): void
    getPublishedFileDetails(fileIds: string[], callback: (...args: unknown[]) => void): void
    getEncryptedAppTicket(appId: number, callback: (...args: unknown[]) => void): void
    getManifest(appId: number, depotId: number, manifestId: string, depotKey: Buffer, callback: (...args: unknown[]) => void): void
    getDepotDecryptionKey(appId: number, depotId: number, callback: (...args: unknown[]) => void): void
    getContentServers(callback: (...args: unknown[]) => void): void
    downloadChunk(...args: unknown[]): unknown
    steamID?: { getSteamID64(): string }
  }
}

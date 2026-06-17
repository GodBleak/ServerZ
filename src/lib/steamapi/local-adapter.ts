import {
  SteamDepotClient,
  type DownloadAppOptions,
  type DownloadAppResult,
  type DownloadWorkshopFileOptions,
  type DownloadWorkshopFileResult,
  type QrChallenge,
  type ValidateAppOptions,
  type ValidateAppResult,
} from "./depot-client/src"
import type { SteamDepotClientOptions } from "./depot-client/src/types.js"
import type { SteamAPI } from "./types.js"

export class LocalSteamAPI implements SteamAPI {
  private client: SteamDepotClient
  private loggedIn: boolean = false
  public on: SteamAPI["on"]
  public once: SteamAPI["once"]
  public off: SteamAPI["off"]

  constructor(
    dataDir: string,
    credentialsCacheDir: string,
    private machineName: string,
    private options?: SteamDepotClientOptions & { loginTimeout?: number; onQRChallenge: (challenge: QrChallenge) => void }
  ) {
    this.client = new SteamDepotClient({
      ...options,
      dataDirectory: dataDir,
      credentialCache: {
        filePath: `${credentialsCacheDir}/credentials.json`,
      },
    })
    this.on = this.client.on.bind(this.client) as unknown as SteamAPI["on"]
    this.once = this.client.once.bind(this.client) as unknown as SteamAPI["once"]
    this.off = this.client.off.bind(this.client) as unknown as SteamAPI["off"]

    this.client.on("loggedOn", () => {
      this.loggedIn = true
    })

    this.client.on("disconnected", () => {
      this.loggedIn = false
    })
  }

  /**
   * Login to steam.
   * `login()` reuses credentials if they exist, use `login("anonymous")` to login anonymously.
   */
  public async login(username?: string, password?: string, code?: string): Promise<void> {
    if (this.loggedIn) {
      this.client.emit("debug", "Already logged in, skipping login attempt")
      return
    }

    if (username) {
      if (username === "anonymous") {
        this.client.emit("debug", "Logging in anonymously")
        await this.client.loginAnonymous({ machineName: this.machineName, timeoutMs: this.options?.loginTimeout })
        return
      }

      const savedCredentials = await this.client.getSavedCredentials()
      const savedCredentialsBelongToUser = savedCredentials?.accountName === username.toLowerCase()
      const savedCredentialsNonExpired = savedCredentials?.expiresAt ? savedCredentials.expiresAt * 1000 > Date.now() : false
      if (savedCredentials && savedCredentialsBelongToUser && savedCredentialsNonExpired) {
        this.client.emit("debug", `Reusing saved credentials`)
        await this.client.loginWithSavedCredentials({ machineName: this.machineName, timeoutMs: this.options?.loginTimeout })
        return
      }

      if (password) {
        this.client.emit("debug", `Logging in with provided credentials`)
        await this.client.loginWithCredentials(username, password, {
          machineName: this.machineName,
          machineAuthToken: code,
          authCode: code,
          timeoutMs: this.options?.loginTimeout,
        })
        return
      }
    }

    const savedCredentials = await this.client.getSavedCredentials()
    if (savedCredentials) {
      this.client.emit("debug", `Reusing saved credentials`)
      await this.client.loginWithSavedCredentials({ machineName: this.machineName, timeoutMs: this.options?.loginTimeout })
      return
    }

    this.client.emit("debug", `Starting QR code login flow`)
    await this.client.loginWithQr({ machineName: this.machineName, timeoutMs: this.options?.loginTimeout, onChallenge: this.options?.onQRChallenge })
  }

  public updateApp(appId: number, options: Omit<DownloadAppOptions, "appId">): Promise<DownloadAppResult> {
    return this.client.downloadApp({ ...options, appId })
  }

  public verify(appId: number, options: Omit<ValidateAppOptions, "appId">): Promise<ValidateAppResult> {
    return this.client.validateApp({ ...options, appId })
  }

  public workshopDownload(
    appId: number,
    workshopId: number,
    options: Omit<DownloadWorkshopFileOptions, "appId" | "publishedFileId">
  ): Promise<DownloadWorkshopFileResult> {
    return this.client.downloadWorkshopFile({ ...options, appId, publishedFileId: workshopId })
  }
}

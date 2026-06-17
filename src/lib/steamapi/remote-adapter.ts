import { EventEmitter } from "node:events"
import { feathers } from "@feathersjs/feathers"
import type { Application } from "@feathersjs/feathers"
import socketioClient, { type SocketService } from "@feathersjs/socketio-client"
import * as Engine from "engine.io-client"
import { io as createSocketIoClient, type Socket } from "socket.io-client"
import type {
  DownloadAppOptions,
  DownloadAppResult,
  DownloadWorkshopFileOptions,
  DownloadWorkshopFileResult,
  QrChallenge,
  ValidateAppOptions,
  ValidateAppResult,
} from "./depot-client/src"
import { installBunUnixFetch } from "./bun-unix-fetch.js"
import {
  hydrateSteamEventArgs,
  type LoginResponse,
  type SerializedSteamEvent,
  type SteamContentServiceClient,
  type UpdateAppRequest,
  type VerifyAppRequest,
  type WorkshopDownloadRequest,
} from "../depot-daemon-shared/depot-daemon-api.js"
import type { SteamAPI } from "./types.js"

type SteamContentSocketService = SocketService & SteamContentServiceClient

type ServiceTypes = {
  steam: SteamContentSocketService
}

export type RemoteSteamAPITransport = "uds" | "tcp"

export type RemoteSteamAPIOptions = {
  transport: RemoteSteamAPITransport
  /** Unix socket path used when transport is `uds`. */
  socketPath?: string
  /** HTTP origin used by Socket.IO. In UDS mode this is a fake origin routed through Bun fetch. */
  url?: string
  socketIoPath?: string
  timeoutMs?: number
  onQRChallenge?: (challenge: QrChallenge) => void
}

const DEFAULT_UDS_ORIGIN = "http://depot-daemon.local"
const DEFAULT_SOCKET_IO_PATH = "/socket.io/"
const FetchTransport = (Engine as { Fetch?: unknown }).Fetch

export class RemoteSteamAPI extends EventEmitter implements SteamAPI {
  private readonly app: Application<ServiceTypes>
  private readonly socket: Socket
  private readonly steamService: SteamContentSocketService
  private readonly timeoutMs: number
  private connected?: Promise<void>
  private restoreFetch?: () => void

  constructor(private readonly options: RemoteSteamAPIOptions) {
    super()
    const url = options.url ?? DEFAULT_UDS_ORIGIN
    const socketIoPath = options.socketIoPath ?? DEFAULT_SOCKET_IO_PATH
    this.timeoutMs = options.timeoutMs ?? 60_000

    if (options.transport === "uds") {
      if (!options.socketPath) throw new Error("RemoteSteamAPI UDS transport requires socketPath")
      this.restoreFetch = installBunUnixFetch(options.socketPath, url)
      if (!FetchTransport) throw new Error("engine.io-client does not expose the Fetch transport required for UDS mode")
      this.socket = createSocketIoClient(url, {
        path: socketIoPath,
        transports: [FetchTransport as never],
        upgrade: false,
        forceNew: true,
        timeout: this.timeoutMs,
      })
    } else {
      this.socket = createSocketIoClient(url, {
        path: socketIoPath,
        forceNew: true,
        timeout: this.timeoutMs,
      })
    }

    this.app = feathers<ServiceTypes>()
    const socketConnection = socketioClient(this.socket, { timeout: this.timeoutMs })
    this.app.configure(socketConnection)
    this.steamService = socketConnection.service("steam") as unknown as SteamContentSocketService

    this.socket.on("connect", () => this.emit("debug", `Connected to Steam content daemon using ${this.socket.io.engine.transport.name}`))
    this.socket.on("disconnect", (reason) => this.emit("disconnected", undefined, `Steam content daemon disconnected: ${reason}`))
    this.socket.on("connect_error", (error) => this.emit("error", error instanceof Error ? error : new Error(String(error))))

    this.steamService.on("steamEvent", (event) => this.forwardSteamEvent(event))
  }

  public async login(username?: string, password?: string, code?: string): Promise<void> {
    await this.ensureConnected()
    const result: LoginResponse = await this.steamService.login({ username, password, code })
    if (result.alreadyLoggedIn) this.emit("debug", "Already logged in, skipping remote login attempt")
  }

  public async updateApp(appId: number, options: Omit<DownloadAppOptions, "appId">): Promise<DownloadAppResult> {
    await this.ensureConnected()
    return this.steamService.updateApp({ appId, options } satisfies UpdateAppRequest)
  }

  public async verify(appId: number, options: Omit<ValidateAppOptions, "appId">): Promise<ValidateAppResult> {
    await this.ensureConnected()
    return this.steamService.verify({ appId, options } satisfies VerifyAppRequest)
  }

  public async workshopDownload(
    appId: number,
    workshopId: number,
    options: Omit<DownloadWorkshopFileOptions, "appId" | "publishedFileId">
  ): Promise<DownloadWorkshopFileResult> {
    await this.ensureConnected()
    return this.steamService.workshopDownload({ appId, workshopId, options } satisfies WorkshopDownloadRequest)
  }

  public close(): void {
    this.socket.close()
    this.restoreFetch?.()
  }

  private ensureConnected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve()
    this.connected ??= new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error("Timed out connecting to Steam content daemon"))
      }, this.timeoutMs)

      const cleanup = () => {
        clearTimeout(timeout)
        this.socket.off("connect", onConnect)
        this.socket.off("connect_error", onConnectError)
      }

      const onConnect = () => {
        cleanup()
        resolve()
      }

      const onConnectError = (error: Error) => {
        cleanup()
        reject(error)
      }

      this.socket.once("connect", onConnect)
      this.socket.once("connect_error", onConnectError)
    }).finally(() => {
      this.connected = undefined
    })

    return this.connected
  }

  private forwardSteamEvent(event: SerializedSteamEvent): void {
    const args = hydrateSteamEventArgs(event.args)

    this.emit(event.event, ...args)
  }
}

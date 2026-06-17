import { LocalSteamAPI } from "./local-adapter.js"
import { RemoteSteamAPI, type RemoteSteamAPIOptions } from "./remote-adapter.js"
import type { QrChallenge, SteamDepotClientOptions } from "./depot-client/src/types.js"
import type { SteamAPI } from "./types.js"

export type CreateSteamAPIOptions = {
  adapter: "local" | "remote"
  dataDir: string
  credentialsCacheDir: string
  machineName: string
  loginTimeout?: number
  onQRChallenge: (challenge: QrChallenge) => void
  localOptions?: SteamDepotClientOptions
  remote?: Omit<RemoteSteamAPIOptions, "onQRChallenge" | "timeoutMs"> & { timeoutMs?: number }
}

export function createSteamAPI(options: CreateSteamAPIOptions): SteamAPI {
  if (options.adapter === "remote") {
    if (!options.remote) throw new Error("Steam remote adapter selected but remote options were not provided")
    return new RemoteSteamAPI({
      ...options.remote,
      timeoutMs: options.remote.timeoutMs ?? options.loginTimeout,
      onQRChallenge: options.onQRChallenge,
    })
  }

  return new LocalSteamAPI(options.dataDir, options.credentialsCacheDir, options.machineName, {
    ...options.localOptions,
    loginTimeout: options.loginTimeout,
    onQRChallenge: options.onQRChallenge,
  })
}

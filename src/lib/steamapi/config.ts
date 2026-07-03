import { Type, type Static } from "@sinclair/typebox"
import { logger } from "../logger.js"
import { DepotClientConfigSchema } from "../depot-daemon-shared/depot-client.config.schema.js"
import {
  downloadProfiles,
  steamProfileDefaults,
  type DepotClientConfig,
  type SteamDownloadProfile,
  type SteamProfileManagedKey,
} from "../depot-daemon-shared/index.js"

export type { DepotClientConfig, SteamDownloadProfile, SteamProfileManagedKey }
export { DepotClientConfigSchema }

export const SteamAPIAdapterSchema = Type.Union([Type.Literal("local"), Type.Literal("remote")], {
  description: "Steam API adapter. `local` uses the embedded depot client; `remote` delegates Steam downloads to a depot-daemon instance.",
  default: "local",
  env: "STEAM_API_ADAPTER",
})

export const SteamContentTransportSchema = Type.Union([Type.Literal("uds"), Type.Literal("tcp")], {
  description: "Remote depot-daemon transport. Options: `uds`.",
  default: "uds",
  env: "STEAM_CONTENT_TRANSPORT",
})

export const SteamRemoteValidationFailureSchema = Type.Union([Type.Literal("warn"), Type.Literal("fail")], {
  description: "Remote depot-daemon validation failure policy when content repair is suppressed by active content locks. `warn` logs and continues startup; `fail` aborts startup.",
  default: "warn",
  env: "STEAM_REMOTE_VALIDATION_FAILURE",
})

export const SteamRemoteConfigSchema = Type.Object({
  steamContentTransport: SteamContentTransportSchema,
  steamContentSocket: Type.String({
    env: "STEAM_CONTENT_SOCKET",
    default: "/root/.steam/depot.sock",
    description: "Unix socket path for depot-daemon when `STEAM_API_ADAPTER=remote` and `STEAM_CONTENT_TRANSPORT=uds`.",
  }),
  steamContentUrl: Type.String({
    env: "STEAM_CONTENT_URL",
    default: "http://depot-daemon.local",
    description: "Remote depot-daemon URL. For UDS, this is a fake origin routed through Bun's Unix-socket fetch support.",
  }),
  steamContentSocketIoPath: Type.String({
    env: "STEAM_CONTENT_SOCKET_IO_PATH",
    default: "/socket.io/",
    description: "Socket.IO path exposed by depot-daemon.",
  }),
  steamContentTimeoutMs: Type.Number({
    env: "STEAM_CONTENT_TIMEOUT_MS",
    default: 60000,
    description: "Remote depot-daemon connection and request timeout in milliseconds.",
  }),
  steamContentConsumerId: Type.Optional(
    Type.String({
      env: "STEAM_CONTENT_CONSUMER_ID",
      defaultDoc: "`serverz:${HOSTNAME}:${APP_ID}`",
      description: "Consumer identity used when registering live content locks with depot-daemon. Defaults to a ServerZ/container/app identifier.",
    })
  ),
  steamContentLockHeartbeatMs: Type.Number({
    env: "STEAM_CONTENT_LOCK_HEARTBEAT_MS",
    default: 10000,
    description: "Interval for refreshing remote depot-daemon content locks while DayZ is running.",
  }),
  steamContentLockTtlMs: Type.Number({
    env: "STEAM_CONTENT_LOCK_TTL_MS",
    default: 30000,
    description: "Depot-daemon content-lock TTL. If heartbeats stop for this long, daemon releases this consumer's locks.",
  }),
  steamRemoteValidationFailure: SteamRemoteValidationFailureSchema,
  echoMinorRemoteSteamDetails: Type.Optional(
    Type.Boolean({
      env: "ECHO_MINOR_REMOTE_STEAM_DETAILS",
      default: false,
      description: "Echo minor remote Steam details to the console, when connected to depot-daemon.",
    })
  ),
})

export const SteamServerZConfigSchema = Type.Object({
  steamApiAdapter: SteamAPIAdapterSchema,
  steamUsername: Type.Optional(
    Type.String({
      env: "STEAM_USERNAME",
      section: "meta",
      defaultDoc: "`undefined`",
      description:
        "The username for the Steam account to use for downloading the server and mods. User/password login is supported but discouraged; prefer QR code login & cached credentials.",
    })
  ),
  steamPassword: Type.Optional(
    Type.String({
      env: "STEAM_PASSWORD",
      section: "meta",
      defaultDoc: "`undefined`",
      description: "The password for the Steam account to use for downloading the server and mods. Discouraged except for bootstrapping credentials.",
    })
  ),
  steamGuardCode: Type.Optional(
    Type.String({
      env: "STEAM_GUARD_CODE",
      section: "server",
      defaultDoc: "`undefined`",
      description: "The Steam Guard code/token for bootstrapping a Steam login when required.",
    })
  ),
  appID: Type.Number({
    env: "STEAM_APP_ID",
    defaultDoc: "`{APP_ID}`",
    noDefault: true,
    description: "The Steam App ID for DayZ Server",
  }),
  downloadDirectory: Type.String({
    env: "STEAM_DOWNLOAD_DIRECTORY",
    defaultDoc: "`INSTALL_DIRECTORY`",
    description: "The directory where the server is installed. This should be bind-mounted to a persistent directory on the host.",
  }),
  configDirectory: Type.String({
    description: "The directory where the Steam configuration is stored. Defaults to the value of `/root/.steam`.",
    default: "/root/.steam",
    env: "STEAM_CONFIG_DIRECTORY",
  }),
})

export const SteamConfigSchema = Type.Intersect([SteamServerZConfigSchema, SteamRemoteConfigSchema, DepotClientConfigSchema])

export type SteamConfig = Static<typeof SteamServerZConfigSchema> & Static<typeof SteamRemoteConfigSchema> & DepotClientConfig

const steamProfileManagedKeys = [
  "downloadBackend",
  "maxConcurrentChunks",
  "maxConcurrentDepots",
  "maxConcurrentFiles",
  "maxOpenFileHandles",
  "bunCdnFetchTimeoutMs",
] as const satisfies readonly SteamProfileManagedKey[]

export function resolveSteamDownloadProfile(value: unknown, defaultProfile: SteamDownloadProfile): SteamDownloadProfile {
  if (typeof value === "string" && downloadProfiles.includes(value as SteamDownloadProfile)) return value as SteamDownloadProfile
  if (value !== undefined && value !== null && value !== "") logger.warn(`Invalid Steam download profile "${JSON.stringify(value)}"; falling back to safe`)
  return value === undefined || value === null || value === "" ? defaultProfile : "safe"
}

export function getSteamProfileManagedDefaults(profile: SteamDownloadProfile): Pick<SteamConfig, SteamProfileManagedKey> {
  return steamProfileDefaults[profile]
}

export function getSteamProfileManagedKeys(): readonly SteamProfileManagedKey[] {
  return steamProfileManagedKeys
}

export function normalizeSteamConfig(
  rawConfig: { meta?: Record<string, unknown>; steam?: Record<string, unknown> },
  defaults: { steam?: Partial<SteamConfig> }
) {
  rawConfig.steam ??= {}
  const steam = rawConfig.steam
  const meta = rawConfig.meta ?? {}

  steam["appID"] ??= meta["appID"]
  steam["downloadDirectory"] ??= meta["installDirectory"]

  for (const key of [
    "steamGuardCode",
    "branchPassword",
    "os",
    "arch",
    "verifyExisting",
    "repairInvalidFiles",
    "bunExecutable",
    "ffiLzmaWorkers",
    "ffiLzmaLibraryPath",
    "ffiLzmaMemlimitBytes",
  ])
    if (steam[key] === null || steam[key] === "") steam[key] = undefined

  if (!Array.isArray(steam["depots"]) && typeof steam["depots"] === "string" && String(steam["depots"]).length > 0) {
    steam["depots"] = String(steam["depots"])
      .split(",")
      .map((depot) => Number(depot.trim()))
      .filter((depot) => Number.isFinite(depot))
  } else if (!Array.isArray(steam["depots"])) {
    steam["depots"] = undefined
  }

  const appID = typeof steam["appID"] === "number" || typeof steam["appID"] === "string" ? steam["appID"] : meta["appID"]
  steam["steamContentConsumerId"] ??= `serverz:${Bun.env.HOSTNAME ?? "unknown"}:${typeof appID === "number" || typeof appID === "string" ? appID : "unknown"}`

  const defaultAppProfile = defaults.steam?.appDownloadProfile ?? "fast"
  steam["appDownloadProfile"] = resolveSteamDownloadProfile(steam["appDownloadProfile"], defaultAppProfile)
  steam["workshopDownloadProfile"] = resolveSteamDownloadProfile(steam["workshopDownloadProfile"], steam["appDownloadProfile"] as SteamDownloadProfile)
}

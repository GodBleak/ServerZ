import { Type, type Static } from '@sinclair/typebox'
import { DepotClientConfigSchema, type DepotClientConfig } from './depot-client.config.schema.js'

export const DepotDaemonTransportSchema = Type.Union([Type.Literal('uds'), Type.Literal('tcp')], {
  description: 'Depot daemon transport. Options: `uds`.',
  default: 'uds',
  env: 'STEAM_CONTENT_TRANSPORT'
})

export const DepotDaemonRuntimeConfigSchema = Type.Object({
  transport: DepotDaemonTransportSchema,
  socketPath: Type.String({
    env: 'STEAM_CONTENT_SOCKET',
    default: '/root/.steam/depot.sock',
    description: 'Unix socket path exposed by depot-daemon when STEAM_CONTENT_TRANSPORT=uds.'
  }),
  socketIoPath: Type.String({
    env: 'STEAM_CONTENT_SOCKET_IO_PATH',
    default: '/socket.io/',
    description: 'Socket.IO path exposed by depot-daemon.'
  }),
  socketMode: Type.String({
    env: 'STEAM_CONTENT_SOCKET_MODE',
    default: '0660',
    description: 'Filesystem mode applied to the Unix socket after bind.'
  }),
  dataDirectory: Type.String({
    env: 'STEAM_CONTENT_DATA_DIR',
    default: '/root/.steam',
    description: 'Steam client data directory used by depot-daemon.'
  }),
  credentialsCacheFile: Type.String({
    env: 'STEAM_CONTENT_CREDENTIALS_FILE',
    default: '/root/.steam/auth/credentials.json',
    description: 'Credential cache file owned by depot-daemon.'
  }),
  machineName: Type.String({
    env: 'STEAM_MACHINE_NAME',
    default: 'depot-daemon',
    description: 'Machine name used for Steam login sessions.'
  }),
  loginTimeoutMs: Type.Number({
    env: 'STEAM_LOGIN_TIMEOUT_MS',
    default: 60000,
    description: 'Steam login timeout in milliseconds.'
  }),
  downloadDirectory: Type.String({
    env: 'STEAM_DOWNLOAD_DIRECTORY',
    default: '/steam/app',
    description: 'Directory where depot-daemon installs Steam app/server files. Clients cannot override this.'
  }),
  workshopDirectory: Type.String({
    env: 'STEAM_WORKSHOP_DIRECTORY',
    default: '/steam/workshop/content',
    description: 'Directory where depot-daemon installs Steam workshop files. Clients cannot override this.'
  })
})

export const SteamContentConfigSchema = Type.Intersect([DepotDaemonRuntimeConfigSchema, DepotClientConfigSchema])

export const DepotDaemonConfigSchema = Type.Object({
  steamContent: SteamContentConfigSchema
})

export type DepotDaemonRuntimeConfig = Static<typeof DepotDaemonRuntimeConfigSchema>
export type SteamContentConfig = DepotDaemonRuntimeConfig & DepotClientConfig

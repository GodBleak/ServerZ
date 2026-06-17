import type {
  DownloadAppOptions,
  DownloadAppResult,
  DownloadWorkshopFileOptions,
  DownloadWorkshopFileResult,
  ValidateAppOptions,
  ValidateAppResult
} from '../steamapi/depot-client/src/index.js'

export type SteamContentEventName =
  | 'debug'
  | 'warn'
  | 'error'
  | 'loggedOn'
  | 'disconnected'
  | 'refreshToken'
  | 'credentialsLoaded'
  | 'credentialsSaved'
  | 'credentialsCleared'
  | 'qr'
  | 'remoteInteraction'
  | 'depotStart'
  | 'fileStart'
  | 'fileProgress'
  | 'fileComplete'
  | 'fileSkip'
  | 'fileFailed'
  | 'depotComplete'
  | 'depotSkip'
  | 'depotProfile'
  | 'appProgress'
  | 'appProfile'

export const STEAM_CONTENT_EVENT_NAMES = [
  'debug',
  'warn',
  'error',
  'loggedOn',
  'disconnected',
  'refreshToken',
  'credentialsLoaded',
  'credentialsSaved',
  'credentialsCleared',
  'qr',
  'remoteInteraction',
  'depotStart',
  'fileStart',
  'fileProgress',
  'fileComplete',
  'fileSkip',
  'fileFailed',
  'depotComplete',
  'depotSkip',
  'depotProfile',
  'appProgress',
  'appProfile'
] as const satisfies readonly SteamContentEventName[]

export type SerializedError = {
  __type: 'Error'
  name: string
  message: string
  stack?: string
  code?: unknown
  cause?: unknown
}

export type SerializedSteamEvent = {
  event: SteamContentEventName
  args: unknown[]
  emittedAt: string
}

export type LoginRequest = {
  username?: string
  password?: string
  code?: string
}

export type LoginResponse = {
  ok: true
  alreadyLoggedIn?: boolean
}

export type UpdateAppRequest = {
  appId: number
  options: Omit<DownloadAppOptions, 'appId'>
}

export type VerifyAppRequest = {
  appId: number
  options: Omit<ValidateAppOptions, 'appId'>
}

export type WorkshopDownloadRequest = {
  appId: number
  workshopId: number
  options: Omit<DownloadWorkshopFileOptions, 'appId' | 'publishedFileId'>
}

export type SteamContentServiceMethods = {
  login(data: LoginRequest): Promise<LoginResponse>
  updateApp(data: UpdateAppRequest): Promise<DownloadAppResult>
  verify(data: VerifyAppRequest): Promise<ValidateAppResult>
  workshopDownload(data: WorkshopDownloadRequest): Promise<DownloadWorkshopFileResult>
}

export type SteamContentServiceEvents = {
  on(event: 'steamEvent', listener: (event: SerializedSteamEvent) => void): unknown
  once(event: 'steamEvent', listener: (event: SerializedSteamEvent) => void): unknown
  off(event: 'steamEvent', listener: (event: SerializedSteamEvent) => void): unknown
}

export type SteamContentServiceClient = SteamContentServiceMethods & SteamContentServiceEvents

export function serializeSteamEventArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    const withMaybeCode = arg as Error & { code?: unknown }
    return {
      __type: 'Error',
      name: arg.name,
      message: arg.message,
      stack: arg.stack,
      code: withMaybeCode.code,
      cause: arg.cause
    } satisfies SerializedError
  }

  return arg
}

export function serializeSteamEvent(event: SteamContentEventName, args: unknown[]): SerializedSteamEvent {
  const serializedArgs = event === 'qr' ? [serializeQrEvent(args[0])] : args.map(serializeSteamEventArg)
  return {
    event,
    args: serializedArgs,
    emittedAt: new Date().toISOString()
  }
}

export function hydrateSteamEventArg(arg: unknown): unknown {
  if (isSerializedError(arg)) {
    const error = new Error(arg.message, { cause: arg.cause }) as Error & { code?: unknown }
    error.name = arg.name
    error.stack = arg.stack
    error.code = arg.code
    return error
  }

  return arg
}

export function hydrateSteamEventArgs(args: unknown[]): unknown[] {
  return args.map(hydrateSteamEventArg)
}

function isSerializedError(value: unknown): value is SerializedError {
  return typeof value === 'object' && value !== null && (value as Record<string, unknown>).__type === 'Error'
}

function serializeQrEvent(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const qrChallengeUrl = (value as { qrChallengeUrl?: unknown }).qrChallengeUrl
  return typeof qrChallengeUrl === 'string' ? { qrChallengeUrl } : value
}

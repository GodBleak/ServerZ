import type {
  DownloadAppOptions,
  DownloadAppResult,
  DownloadWorkshopFileOptions,
  DownloadWorkshopFileResult,
  ValidateAppOptions,
  ValidateAppResult
} from '../depot-client/index.js'

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

export type AppContentLock = {
  type: 'app'
  appId: number
}

export type WorkshopContentLock = {
  type: 'workshop'
  appId: number
  workshopId: number
}

export type ContentLock = AppContentLock | WorkshopContentLock

export type ContentLockState = {
  content: ContentLock
  activeConsumers: string[]
}

export type RegisterContentLocksRequest = {
  consumerId: string
  content: ContentLock[]
  ttlMs: number
}

export type ContentLockHeartbeatRequest = {
  consumerId: string
  ttlMs: number
}

export type ReleaseContentLocksRequest = {
  consumerId: string
}

export type ContentLockResponse = {
  ok: true
  locks: ContentLockState[]
}

export type ContentLockedAppValidationResult = {
  contentLocked: true
  operation: 'updateApp'
  content: AppContentLock
  activeConsumers: string[]
  repairSuppressed: true
  validation: ValidateAppResult
}

export type ContentLockedWorkshopDownloadResult = {
  contentLocked: true
  operation: 'workshopDownload'
  content: WorkshopContentLock
  activeConsumers: string[]
  repairSuppressed: true
}

export type UpdateAppResponse = DownloadAppResult | ContentLockedAppValidationResult
export type WorkshopDownloadResponse = DownloadWorkshopFileResult | ContentLockedWorkshopDownloadResult

export type SteamContentServiceMethods = {
  login(data: LoginRequest): Promise<LoginResponse>
  updateApp(data: UpdateAppRequest): Promise<UpdateAppResponse>
  verify(data: VerifyAppRequest): Promise<ValidateAppResult>
  workshopDownload(data: WorkshopDownloadRequest): Promise<WorkshopDownloadResponse>
  registerContentLocks(data: RegisterContentLocksRequest): Promise<ContentLockResponse>
  heartbeatContentLocks(data: ContentLockHeartbeatRequest): Promise<ContentLockResponse>
  releaseContentLocks(data: ReleaseContentLocksRequest): Promise<ContentLockResponse>
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

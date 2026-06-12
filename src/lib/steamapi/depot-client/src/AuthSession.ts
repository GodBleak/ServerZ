import { EventEmitter } from 'node:events';
import { EAuthTokenPlatformType, LoginSession } from 'steam-session';
import { WebApiAuthTransport } from './auth/WebApiAuthTransport.js';
import type { LoginResult, QrChallenge, QrLoginOptions } from './types.js';

export interface QrLoginAttemptEvents {
  challenge: [QrChallenge];
  polling: [];
  remoteInteraction: [unknown?];
  authenticated: [LoginResult];
  timeout: [];
  error: [Error];
}

export class QrLoginAttempt extends EventEmitter {
  readonly session: LoginSession;
  qrChallengeUrl: string;

  private terminalResult?: LoginResult;
  private terminalError?: Error;
  private terminalKind?: 'authenticated' | 'timeout' | 'error';

  private constructor(session: LoginSession, qrChallengeUrl: string) {
    super();
    this.session = session;
    this.qrChallengeUrl = qrChallengeUrl;

    // EventEmitter treats an unhandled "error" event as fatal. Session errors can
    // happen before beginQrLogin()/waitForAuthentication() attach listeners, so keep
    // a no-op listener installed while still allowing user listeners to observe it.
    super.on('error', () => undefined);
  }

  static async start(options: QrLoginOptions = {}): Promise<QrLoginAttempt> {
    const sessionOptions: Record<string, unknown> = {
      machineId: true,
      machineFriendlyName: options.machineFriendlyName ?? options.machineName,
      ...(options.sessionOptions ?? {})
    };

    if (!sessionOptions.transport && selectQrTransport(options.qrTransport) === 'webapi') 
      sessionOptions.transport = new WebApiAuthTransport();
    

    const session = new LoginSession(EAuthTokenPlatformType.SteamClient, sessionOptions);

    if (options.loginTimeoutMs) 
      session.loginTimeout = options.loginTimeoutMs;
    

    const attempt = new QrLoginAttempt(session, '');
    attempt.bindSessionEvents();

    const response = await session.startWithQR();
    if (!response.qrChallengeUrl) 
      throw new Error('steam-session.startWithQR() returned no qrChallengeUrl');
    

    attempt.qrChallengeUrl = response.qrChallengeUrl;

    const challenge: QrChallenge = { qrChallengeUrl: response.qrChallengeUrl };
    attempt.emit('challenge', challenge);
    options.onChallenge?.(challenge);

    return attempt;
  }

  waitForAuthentication(): Promise<LoginResult> {
    if (this.terminalKind === 'authenticated' && this.terminalResult) 
      return Promise.resolve(this.terminalResult);
    

    if (this.terminalError) 
      return Promise.reject(this.terminalError);
    

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.off('authenticated', onAuthenticated);
        this.off('error', onError);
        this.off('timeout', onTimeout);
      };

      const onAuthenticated = (result: LoginResult) => {
        cleanup();
        resolve(result);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onTimeout = () => {
        cleanup();
        reject(this.terminalError ?? new Error('QR login timed out'));
      };

      this.once('authenticated', onAuthenticated);
      this.once('error', onError);
      this.once('timeout', onTimeout);

      // Re-check after registering listeners in case a terminal event was emitted
      // synchronously by an unusual/custom transport while we were setting up.
      if (this.terminalKind === 'authenticated' && this.terminalResult) 
        onAuthenticated(this.terminalResult);
       else if (this.terminalError) 
        onError(this.terminalError);
      
    });
  }

  cancel(): void {
    if (typeof this.session.cancelLoginAttempt === 'function') 
      this.session.cancelLoginAttempt();
    
  }

  override on<K extends keyof QrLoginAttemptEvents>(eventName: K, listener: (...args: QrLoginAttemptEvents[K]) => void): this;
  override on(eventName: string, listener: (...args: unknown[]) => void): this {
    return super.on(eventName, listener);
  }

  override once<K extends keyof QrLoginAttemptEvents>(eventName: K, listener: (...args: QrLoginAttemptEvents[K]) => void): this;
  override once(eventName: string, listener: (...args: unknown[]) => void): this {
    return super.once(eventName, listener);
  }

  override emit<K extends keyof QrLoginAttemptEvents>(eventName: K, ...args: QrLoginAttemptEvents[K]): boolean;
  override emit(eventName: string, ...args: unknown[]): boolean {
    return super.emit(eventName, ...args);
  }

  private bindSessionEvents(): void {
    this.session.on('polling', () => {
      this.emit('polling');
    });
    this.session.on('remoteInteraction', () => {
      this.emit('remoteInteraction');
    });
    this.session.on('timeout', () => {
      this.markTimeout();
    });
    this.session.on('error', error => {
      this.markError(normalizeError(error));
    });
    this.session.on('authenticated', () => {
      const result: LoginResult = {
        accountName: this.session.accountName,
        steamID: this.session.steamID?.toString(),
        refreshToken: this.session.refreshToken,
        accessToken: this.session.accessToken
      };

      this.markAuthenticated(result);
    });
  }

  private markAuthenticated(result: LoginResult): void {
    if (this.terminalKind) return;

    this.terminalKind = 'authenticated';
    this.terminalResult = result;
    this.emit('authenticated', result);
  }

  private markTimeout(): void {
    if (this.terminalKind) return;

    this.terminalKind = 'timeout';
    this.terminalError = new Error('QR login timed out');
    this.emit('timeout');
  }

  private markError(error: Error): void {
    if (this.terminalKind) return;

    this.terminalKind = 'error';
    this.terminalError = error;
    this.emit('error', error);
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function selectQrTransport(mode: QrLoginOptions['qrTransport'] = 'auto'): 'webapi' | 'websocket' {
  if (mode === 'webapi' || mode === 'websocket') 
    return mode;
  

  // Bun currently exposes a global Bun object. Use WebAPI there to avoid TLS
  // hostname mismatches seen on Steam's rotating WebSocket CM endpoints.
  return typeof Bun !== 'undefined' ? 'webapi' : 'websocket';
}

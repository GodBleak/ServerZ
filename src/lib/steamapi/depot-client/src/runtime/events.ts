import { EventEmitter } from 'node:events';

export function waitForEvent<T>(
  emitter: EventEmitterLike,
  eventName: string,
  options: { errorEvent?: string; timeoutMs?: number; rejectOnDisconnect?: boolean } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      off(eventName, onEvent);
      off(options.errorEvent ?? 'error', onError);
      off('disconnected', onDisconnected);
    };

    const off = (name: string, listener: (...args: unknown[]) => void) => {
      if (typeof emitter.off === 'function') emitter.off(name, listener);
      else emitter.removeListener(name, listener);
    };

    const onEvent = (...args: unknown[]) => {
      cleanup();
      resolve((args.length <= 1 ? args[0] : args) as T);
    };

    const onError = (...args: unknown[]) => {
      cleanup();
      reject(args[0] instanceof Error ? args[0] : new Error(String(args[0])));
    };

    const onDisconnected = (...args: unknown[]) => {
      cleanup();
      const eresult = args[0];
      const message = typeof args[1] === 'string' ? args[1] : undefined;
      reject(new Error(message ? `Disconnected before ${eventName}: ${message}` : `Disconnected before ${eventName}${eresult !== undefined ? ` (${JSON.stringify(eresult)})` : ''}`));
    };

    emitter.once(eventName, onEvent);
    emitter.once(options.errorEvent ?? 'error', onError);

    if (options.rejectOnDisconnect) 
      emitter.once('disconnected', onDisconnected);
    

    if (options.timeoutMs && Number.isFinite(options.timeoutMs)) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${eventName}`));
      }, options.timeoutMs);
    }
  });
}

export interface EventEmitterLike {
  once(event: string, listener: (...args: unknown[]) => void): this;
  removeListener(event: string, listener: (...args: unknown[]) => void): this;
  off?(event: string, listener: (...args: unknown[]) => void): this;
}

export class ForwardingEventEmitter extends EventEmitter {
  protected forward(from: EventEmitterLike & { on(event: string, listener: (...args: unknown[]) => void): unknown }, events: string[]): void {
    for (const event of events) 
      from.on(event, (...args: unknown[]) => this.emit(event, ...args));
    
  }
}

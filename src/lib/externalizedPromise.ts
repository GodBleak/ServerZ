export class ExternalizedPromise<T> {
  private _promise: Promise<T>
  private _resolve!: (value: T) => void
  private _reject!: (reason?: unknown) => void

  constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  public get promise(): Promise<T> {
    return this._promise
  }

  public resolve(value: T): void {
    this._resolve(value)
  }

  public reject(reason?: unknown): void {
    this._reject(reason)
  }
}

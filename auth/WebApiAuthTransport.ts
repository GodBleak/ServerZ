export interface SteamAuthApiRequest {
  apiInterface: string;
  apiMethod: string;
  apiVersion: number;
  accessToken?: string;
  requestData?: Buffer | Uint8Array;
  headers?: Record<string, string | number | boolean | undefined>;
}

export interface SteamAuthApiResponse {
  result?: number;
  errorMessage?: string;
  responseData?: Buffer;
}

export interface SteamAuthTransport {
  sendRequest(request: SteamAuthApiRequest): Promise<SteamAuthApiResponse>;
  close(): void;
}

export type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<FetchLikeResponse>;

const DEFAULT_WEB_API_AUTH_TIMEOUT_MS = 100_000;

export interface WebApiAuthTransportOptions {
  /** Defaults to https://api.steampowered.com. Exposed mostly for tests. */
  baseUrl?: string;
  /** Advanced override, useful in tests or runtimes that wrap fetch. */
  fetchImpl?: FetchLike;
  /** Request timeout in milliseconds. Defaults to 100s to match .NET HttpClient/DepotDownloader behavior. Set 0 to disable. */
  timeoutMs?: number;
}

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

const GET_REQUESTS = new Set([
  'IAuthenticationService/GetPasswordRSAPublicKey/v1'
]);

const DEFAULT_HEADERS: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'sec-fetch-site': 'cross-site',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty'
};

/**
 * Minimal steam-session-compatible auth transport that talks to Steam's WebAPI endpoint.
 *
 * This is intentionally small and local instead of importing steam-session internals. In Bun,
 * steam-session's default SteamClient QR path uses WebSocket CM endpoints whose TLS names can
 * fail strict hostname validation for some Steam CDN hosts. Using the WebAPI auth transport keeps
 * the QR flow on api.steampowered.com while still requesting SteamClient-scoped tokens.
 */
export class WebApiAuthTransport implements SteamAuthTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: WebApiAuthTransportOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://api.steampowered.com';
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit) as Promise<FetchLikeResponse>);
    this.timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_WEB_API_AUTH_TIMEOUT_MS);
  }

  async sendRequest(request: SteamAuthApiRequest): Promise<SteamAuthApiResponse> {
    const urlPath = `I${request.apiInterface}Service/${request.apiMethod}/v${request.apiVersion}`;
    const method = GET_REQUESTS.has(urlPath) ? 'GET' : 'POST';
    const url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/${urlPath}/`);

    if (request.accessToken) 
      url.searchParams.set('access_token', request.accessToken);
    

    const encodedPayload = request.requestData && request.requestData.length > 0
      ? Buffer.from(request.requestData).toString('base64')
      : undefined;

    let body: unknown;
    if (encodedPayload) {
      if (method === 'GET') {
        url.searchParams.set('input_protobuf_encoded', encodedPayload);
      } else {
        const form = new FormData();
        form.set('input_protobuf_encoded', encodedPayload);
        body = form;
      }
    }

    const headers = normalizeHeaders({
      ...DEFAULT_HEADERS,
      ...(request.headers ?? {})
    });

    // Let fetch set the multipart boundary when FormData is used.
    delete headers['content-type'];

    const controller = this.timeoutMs > 0 ? new AbortController() : undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    let response: FetchLikeResponse;
    try {
      const request = this.fetchImpl(url.toString(), {
        method,
        headers,
        body,
        ...(controller ? { signal: controller.signal } : {})
      });

      response = controller
        ? await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              controller.abort(new Error(`Steam WebAPI auth request timed out after ${this.timeoutMs}ms.`));
              reject(new Error(`Steam WebAPI auth request timed out after ${this.timeoutMs}ms.`));
            }, this.timeoutMs);
          })
        ])
        : await request;
    } catch (error) {
      if (controller?.signal.aborted) 
        throw new Error(`Steam WebAPI auth request timed out after ${this.timeoutMs}ms.`, { cause: error });
      
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const resultHeader = response.headers.get('x-eresult');
    const errorMessage = response.headers.get('x-error_message') ?? undefined;
    const parsedResult = resultHeader ? Number.parseInt(resultHeader, 10) : undefined;

    if (!response.ok) {
      const message = errorMessage ?? response.statusText ?? `Steam WebAPI error ${response.status}`;
      const error = new Error(message) as Error & { code?: number; responseBody?: Buffer };
      error.code = response.status;
      error.responseBody = bytes;
      throw error;
    }

    return {
      // EResult.OK is 1. Steam normally sends x-eresult, but defaulting successful HTTP responses
      // to OK makes this transport more robust across auth endpoints.
      result: Number.isFinite(parsedResult) ? parsedResult : 1,
      errorMessage,
      responseData: bytes
    };
  }

  close(): void {
    // fetch-based transport has no persistent resources to close.
  }
}

function normalizeHeaders(input: Record<string, string | number | boolean | undefined>): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    output[key.toLowerCase()] = String(value);
  }

  return output;
}

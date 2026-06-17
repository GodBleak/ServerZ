type FetchInput = Parameters<typeof fetch>[0]

type BunUnixRequestInit = RequestInit & { unix: string }

export function installBunUnixFetch(socketPath: string, originToRoute: string): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis)
  const expectedOrigin = new URL(originToRoute).origin

  globalThis.fetch = ((input: FetchInput | URL, init?: RequestInit) => {
    const url = toUrl(input)

    if (url.origin === expectedOrigin) {
      return originalFetch(url.toString(), {
        ...init,
        unix: socketPath,
      } as BunUnixRequestInit)
    }

    return originalFetch(input as FetchInput, init)
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch as typeof fetch
  }
}

function toUrl(input: FetchInput | URL): URL {
  if (input instanceof URL) return input
  if (typeof input === "string") return new URL(input)
  return new URL(input.url)
}

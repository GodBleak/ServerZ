export async function hang(options: { handleSignals?: boolean } = {}) {
  setInterval(() => {}, 1000)

  return new Promise<void>(() => {
    if (options.handleSignals === false) return
    process.once("SIGINT", () => process.exit(130))
    process.once("SIGTERM", () => process.exit(143))
  })
}

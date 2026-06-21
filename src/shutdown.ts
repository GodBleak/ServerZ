import { logger } from "#lib/logger"
import { overlay } from "./overlay.js"

let shuttingDown = false

export async function shutdown(code: number, reason: string): Promise<never> {
  if (shuttingDown) process.exit(code)
  shuttingDown = true

  logger.info(`Shutting down: ${reason}`)

  try {
    await overlay.reloading?.promise
    await overlay.copyOut()
  } catch (error) {
    logger.error("copy-mode copyOut failed", error)
    process.exit(1)
  }

  process.exit(code)
}

export function installFatalShutdownHandlers(): void {
  process.once("uncaughtException", (error) => {
    logger.error("Uncaught exception", error)
    void shutdown(1, "uncaughtException")
  })

  process.once("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", reason)
    void shutdown(1, "unhandledRejection")
  })
}

export function installDirectSignalShutdownHandlers(): () => void {
  const onSigterm = () => void shutdown(143, "SIGTERM")
  const onSigint = () => void shutdown(130, "SIGINT")

  process.once("SIGTERM", onSigterm)
  process.once("SIGINT", onSigint)

  return () => {
    process.off("SIGTERM", onSigterm)
    process.off("SIGINT", onSigint)
  }
}

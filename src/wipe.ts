import path from "node:path"
import { stat } from "node:fs/promises"
import { config } from "./config"
import { logger } from "./lib/logger.js"
import { healthReporter } from "./healthReporter.js"
import { hang } from "./lib/hang.js"

export async function wipe() {
  const dryRun = config.meta.wipe === "dry-run"
  if (config.meta.wipe !== true && !dryRun) return

  await countdown(config.meta.wipeTimeout, dryRun)

  logger.warn(dryRun ? "Dry-running server wipe" : "Wiping server")
  if (dryRun) logger.warn("Dry-run enabled, no files will be deleted. Empty directory deletion can not be simulated.")

  // overridesDirectory is always preserved. installDirectory is preserved
  // unless WIPE_INSTALL is set. profilesPath is only wiped on its own when it
  // doesn't already live under a directory we're about to wipe.
  const noWipeDirs = [config.meta.overridesDirectory]
  const dirsToWipe = [config.meta.dataDirectory, config.meta.generatedConfigDirectory]

  if (config.meta.wipeInstall) dirsToWipe.push(config.meta.installDirectory)
  else noWipeDirs.push(config.meta.installDirectory)

  if (!isUnder(config.meta.profilesPath, config.meta.dataDirectory)) dirsToWipe.push(config.meta.profilesPath)

  try {
    // Inform-only pass over the directories we're keeping.
    await runAll(noWipeDirs, (dir) => listDir(dir, dryRun))

    // Files / char-special / symlinks first, then the now-empty directories.
    // Both passes use -mindepth 1 so the target directory itself is never removed.
    await runAll(dirsToWipe, (dir) => wipeFiles(dir, dryRun))
    await runAll(dirsToWipe, (dir) => wipeEmptyDirs(dir, dryRun))

    logger.info(`${dryRun ? "Dry-run" : "Wipe"} complete! You may now unset 'WIPE' in your configuration and restart the server.`)
  } catch (e) {
    logger.crit(`FATAL: ${dryRun ? "Dry-run" : "Wipe"} failed`, e)
    healthReporter.stop()

    logger.warn("Hanging process to prevent crash loop. Manual intervention required. See above.")
    await hang()
  }
}

/**
 * Runs `op` for every directory and waits for all of them to settle. If any
 * rejected, the combined failure is rethrown so a partial/failed wipe is never
 * reported as a success.
 */
async function runAll(dirs: string[], op: (dir: string) => Promise<void>): Promise<void> {
  const results = await Promise.allSettled(dirs.map(op))
  const failures = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []))
  if (failures.length > 0) throw new AggregateError(failures, `${failures.length} of ${dirs.length} directories could not be processed`)
}

async function listDir(dir: string, dryRun: boolean): Promise<void> {
  await find(dir, ["-type", "f,c,l", "-print"], false, (line) => {
    if (dryRun) logger.info(`Would not delete: ${line}`)
    else logger.debug(`ignoring: ${line}`)
  })
}

async function wipeFiles(dir: string, dryRun: boolean): Promise<void> {
  const predicate = ["-type", "f,c,l", "-print"]
  if (!dryRun) predicate.push("-delete")
  await find(dir, predicate, true, (line) => logDeletion(line, dryRun))
}

async function wipeEmptyDirs(dir: string, dryRun: boolean): Promise<void> {
  const predicate = ["-depth", "-type", "d", "-empty", "-print"]
  if (!dryRun) predicate.push("-delete")
  await find(dir, predicate, true, (line) => logDeletion(line, dryRun))
}

function logDeletion(line: string, dryRun: boolean): void {
  if (dryRun) logger.warn(`Would delete: ${line}`)
  else logger.info(`Deleting: ${line}`)
}

/**
 * Runs `find` against a single directory with no shell involved (arguments are
 * passed verbatim, so paths containing spaces or shell metacharacters are safe)
 * and `-mindepth 1` so the directory itself is never a match.
 *
 * A directory that doesn't exist yet is a no-op rather than a failure. Any other
 * non-zero exit is thrown so the caller can treat the wipe as failed.
 */
async function find(dir: string, predicate: string[], _removing: boolean, onLine: (line: string) => void): Promise<void> {
  if (!(await exists(dir))) {
    logger.debug(`Skipping ${dir}: does not exist`)
    return
  }

  const proc = Bun.spawn(["find", dir, "-mindepth", "1", ...predicate], {
    stdout: "pipe",
    stderr: "pipe",
  })

  const stderrLines: string[] = []
  const [, , exitCode] = await Promise.all([
    streamLines(proc.stdout, onLine),
    streamLines(proc.stderr, (line) => {
      stderrLines.push(line)
      logger.error(`stderr: ${line}`)
    }),
    proc.exited,
  ])

  if (exitCode !== 0) throw new Error(`find exited with code ${exitCode} for ${dir}\n${stderrLines.join("\n")}`)
}

/**
 * Drains a piped stream, invoking `onLine` for each non-empty line. Stdout and
 * stderr must be drained concurrently (see the Promise.all above) to avoid a
 * deadlock when one pipe fills while the other is being read.
 */
async function streamLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.trim() !== "") onLine(line)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim() !== "") onLine(buffer)
}

async function exists(target: string): Promise<boolean> {
  return await stat(target)
    .then(() => true)
    .catch(() => false)
}

/** True if `child` is `parent` or lives somewhere beneath it (path-aware, so /data won't match /data-backup). */
function isUnder(child: string, parent: string): boolean {
  const c = path.resolve(child)
  const p = path.resolve(parent)
  return c === p || c.startsWith(p + path.sep)
}

/**
 * Logs a warning and counts down `seconds` before resolving, giving an operator
 * time to terminate the container and cancel the wipe.
 */
async function countdown(seconds: number, dryRun: boolean): Promise<void> {
  logger.warn(
    `Server will ${dryRun ? "dry-run a wipe" : "be wiped"} in ${seconds} seconds. Terminate the process/container to cancel\n` +
      `If you did not intend to wipe the server, ensure 'WIPE' is unset or set to 'false'.\n\n` +
      `If this is your first wipe with ServerZ and you haven't read the Server Wipe documentation,\n` +
      `you're advised to cancel the wipe and read the documentation before proceeding` +
      `${dryRun ? "." : " or at the very least set 'WIPE' to \"dry-run\" first."}`
  )

  let remaining = seconds
  const interval = setInterval(() => {
    remaining -= 1
    if (remaining > 0) logger.warn(`Server ${dryRun ? "wipe dry-run" : "wipe"} in ${remaining} seconds`)
  }, 1000)

  try {
    await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000))
  } finally {
    clearInterval(interval)
  }
}

import fs from "node:fs/promises"
import { exec } from "./lib/exec.js"
import { config } from "./config"
import { logger } from "./lib/logger.js"
import { hang } from "./lib/hang.js"
import { ExternalizedPromise } from "./lib/externalizedPromise.js"

class Overlay {
  private mounted: boolean = false
  private strategy: "kernel" | "fuse" | "copy" | undefined = undefined
  private copyingOut: Promise<void> | undefined = undefined
  public reloading: undefined | ExternalizedPromise<void> = undefined

  public async configure() {
    try {
      await ensureDirectoryExists(config.meta.serverDirectory)
      await ensureDirectoryExists(config.meta.overridesDirectory)
      await ensureDirectoryExists(config.meta.installDirectory)
      await ensureDirectoryExists(config.meta.overlayFSScratchDirectory)
      await ensureDirectoryExists(config.meta.generatedConfigDirectory)
      await ensureDirectoryExists(config.meta.dataDirectory)
      await ensureDirectoryExists(config.meta.profilesPath)
    } catch (e) {
      logger.crit("Failed to ensure required directories exist:", e)
      await hang()
    }

    try {
      await unmountKernelOverlayFS()
      await unmountFuseOverlayFS()
    } catch (e) {
      logger.debug("Overlay unmount error (probably benign):\n", e)
    }

    if (config.meta.useOverlayFS) {
      // Try kernel overlayfs first
      if (config.meta.useFuse === false || config.meta.useFuse === undefined) {
        try {
          await mountKernelOverlayFS()
          this.mounted = true
          this.strategy = "kernel"
          logger.info(`Mounted overlayFS at ${config.meta.serverDirectory}`)
          return
        } catch (e) {
          logger.debug("Kernel overlay mount error:\n", e)
          logger.warn("Kernel overlay mount failed, trying next method")
        }
      }

      // Try fuse-overlayfs second
      if (!this.mounted && (config.meta.useFuse === true || config.meta.useFuse === undefined)) {
        try {
          await mountFuseOverlayFS()
          this.mounted = true
          this.strategy = "fuse"
          logger.info(`Mounted fuse-overlayfs at ${config.meta.serverDirectory}`)
          return
        } catch (e) {
          logger.debug("fuse-overlayfs error", e)
          logger.warn("fuse-overlayfs failed, falling back to copy mode.")
        }
      }
    }

    // Final fallback: copy mode
    if (!this.mounted) {
      try {
        await doCopy()
        this.mounted = true
        this.strategy = "copy"
        logger.warn(`Using copy mode. Server writes may not persist. See https://gitlab.godbleak.dev/godbleak/ServerZ#overlayfs for more information.`)
        logger.info(`Built server directory ${config.meta.serverDirectory} from ${config.meta.installDirectory} and ${config.meta.overridesDirectory}`)
        return
      } catch (e) {
        logger.error("rsync failed", e)
        logger.info("exiting")
        process.exit(1)
      }
    }
  }

  /**
   * Reloads the overlay. This will unmount the overlay and remount it, and will also reload the fs module.
   *
   * Always await overlay.reloading?.promise before calling.
   *
   * **A reload failure is fatal and will cause the server to exit.**
   */
  public async reload() {
    const error = new Error()
    const stack = error.stack
    const lines = stack?.split("\n")
    const caller = lines?.[2]?.trim().substring(3)
    logger.debug(`Reload called from: ${caller}`)
    if (!this.mounted) throw new Error("No overlay mounted to reload, did you forget to call overlay.configure()?")
    if (this.reloading) {
      // don't interrupt fs operations by throwing mid promise
      await this.reloading.promise
      throw new Error("Reload called while another reload is in progress. await overlay.reloading?.promise before calling overlay.reload()")
    }

    this.reloading = new ExternalizedPromise()
    try {
      switch (this.strategy) {
        case "kernel":
          await unmountKernelOverlayFS()
          await mountKernelOverlayFS()
          break
        case "fuse":
          await unmountFuseOverlayFS()
          await mountFuseOverlayFS()
          break
        case "copy":
          await doCopy()
          break
      }
      this.reloading?.resolve()
    } catch (e) {
      logger.crit("Error reloading overlay", e)
      process.exit(1)
    } finally {
      this.reloading = undefined
    }
  }

  public fs = new Proxy(fs, {
    get: (target, prop, receiver) => {
      const original = Reflect.get(target, prop, receiver)
      if (typeof original !== "function") return original
      return async (...args: unknown[]) => {
        if (args.some((arg) => typeof arg === "string" && arg.startsWith(config.meta.serverDirectory))) {
          if (this.reloading) {
            await this.reloading.promise
            return original(...args)
          }
        }
        return original(...args)
      }
    },
  })

  public exec = async (command: string, args: string[]) => {
    if (args.some((arg) => typeof arg === "string" && arg.startsWith(config.meta.serverDirectory))) {
      if (this.reloading) {
        await this.reloading.promise
        return exec(command, args)
      }
    }
    return exec(command, args)
  }

  public async copyOut(): Promise<void> {
    if (this.strategy !== "copy") return
    if (this.copyingOut) return this.copyingOut

    this.copyingOut = this.copyOutImpl().finally(() => {
      this.copyingOut = undefined
    })

    return this.copyingOut
  }

  private async copyOutImpl(): Promise<void> {
    logger.info(`Persisting copy-mode server directory ${config.meta.serverDirectory} to ${config.meta.dataDirectory}`)
    await exec("rsync", ["-a", "--delete", `${config.meta.serverDirectory}/`, `${config.meta.dataDirectory}/`])
  }
}

export const overlay = new Overlay()

async function mountKernelOverlayFS() {
  await exec("mount", [
    "-t",
    "overlay",
    "overlay",
    "-o",
    `lowerdir=${config.meta.generatedConfigDirectory}:${config.meta.overridesDirectory}:${config.meta.installDirectory},upperdir=${config.meta.dataDirectory},workdir=${config.meta.overlayFSScratchDirectory}${config.meta.userXAttr ? ",userxattr" : ""}`,
    config.meta.serverDirectory,
  ])
}

async function unmountKernelOverlayFS() {
  await exec("umount", ["-l", config.meta.serverDirectory])
}

async function mountFuseOverlayFS() {
  await exec("fuse-overlayfs", [
    "-o",
    `lowerdir=${config.meta.generatedConfigDirectory}:${config.meta.overridesDirectory}:${config.meta.installDirectory},upperdir=${config.meta.dataDirectory},workdir=${config.meta.overlayFSScratchDirectory}`,
    config.meta.serverDirectory,
  ])
}

async function unmountFuseOverlayFS() {
  await exec("fusermount", ["-uz", config.meta.serverDirectory])
}

async function doCopy() {
  await exec("rsync", ["-a", `${config.meta.installDirectory}/`, `${config.meta.serverDirectory}/`])
  await exec("rsync", ["-a", `${config.meta.dataDirectory}/`, `${config.meta.serverDirectory}/`])
  await exec("rsync", ["-a", `${config.meta.overridesDirectory}/`, `${config.meta.serverDirectory}/`])
  await exec("rsync", ["-a", `${config.meta.generatedConfigDirectory}/`, `${config.meta.serverDirectory}/`])
}

async function ensureDirectoryExists(path: string) {
  try {
    await fs.mkdir(path, { recursive: true })
    await fs.access(path)
  } catch (cause) {
    throw new Error(`Directory ${path} does not exist and could not be created.`, { cause })
  }
}

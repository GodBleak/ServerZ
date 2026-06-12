import { cpus } from "os"
import path from "node:path"
import { normalizeSteamConfig, type SteamConfig } from "../lib/steamapi/config.js"
import type { ConfigSchema } from "./schema.js"

export const numericBooleanPaths = [
  "server.forceSameBuild",
  "server.disableVon",
  "server.disable3rdPerson",
  "server.disableCrosshair",
  "server.serverTimePersistent",
  "server.storageAutoFix",
  "server.adminLogPlayerHitsOnly",
  "server.adminLogPlacement",
  "server.adminLogBuildActions",
  "server.adminLogPlayerList",
  "server.enableDebugMonitor",
  "server.allowFilePatching",
  "server.multithreadedReplication",
  "server.networkObjectBatchEnforceBandwidthLimits",
  "server.networkObjectBatchUseEstimatedBandwidth",
  "server.networkObjectBatchUseDynamicMaximumBandwidth",
  "server.disablePersonalLight",
  "server.disableBaseDamage",
  "server.disableContainerDamage",
  "server.disableRespawnDialog",
  "server.shotValidation",
  "server.enableCfgGameplayFile",
] as const

export function resolveConfig<R = unknown>(givenConfig: unknown, defaults: ConfigSchema["_defaults"]): R {
  if (typeof givenConfig === "object" && givenConfig !== null) {
    if ("meta" in givenConfig && typeof givenConfig.meta === "object" && givenConfig.meta !== null) {
      givenConfig["_defaults"] = defaults

      normalizeNumericBooleans(givenConfig, numericBooleanPaths)
      normalizeNumericBooleans((givenConfig as { _defaults?: unknown })._defaults, numericBooleanPaths)

      if (!givenConfig.meta["cpuCount"]) givenConfig.meta["cpuCount"] = Math.floor(cpus().length / 2) || 1

      if (!Array.isArray(givenConfig.meta["modList"]) && typeof givenConfig.meta["modList"] === "string" && String(givenConfig.meta["modList"]).length > 0)
        // oxlint-disable-next-line curly
        givenConfig.meta["modList"] = givenConfig.meta["modList"]
          .split(",")
          .map((m) => Number(m.trim()))
          .filter((m) => Number.isFinite(m))
      // oxlint-disable-next-line curly
      else if (!Array.isArray(givenConfig.meta["modList"])) givenConfig.meta["modList"] = []

      let useProvidedOrDefaultOnServerPath = useProvidedOrDefaultPathFactory(givenConfig.meta["serverDirectory"])
      givenConfig.meta["serverDirectory"] = useProvidedOrDefaultOnServerPath(
        defaults.meta?.serverDirectory,
        givenConfig.meta["serverDirectory"],
        givenConfig.meta["appID"]
      )
      useProvidedOrDefaultOnServerPath = useProvidedOrDefaultPathFactory(givenConfig.meta["serverDirectory"])

      let useProvidedOrDefaultOnDataDirectory = useProvidedOrDefaultPathFactory(givenConfig.meta["dataDirectory"])
      givenConfig.meta["dataDirectory"] = useProvidedOrDefaultOnDataDirectory(
        defaults.meta?.dataDirectory,
        givenConfig.meta["dataDirectory"],
        givenConfig.meta["appID"]
      )
      givenConfig.meta["overlayFSScratchDirectory"] = useProvidedOrDefaultOnDataDirectory(
        defaults.meta?.overlayFSScratchDirectory,
        givenConfig.meta["overlayFSScratchDirectory"]
      )

      useProvidedOrDefaultOnDataDirectory = useProvidedOrDefaultPathFactory(givenConfig.meta["dataDirectory"])

      let useProvidedOrDefaultOnInstallDirectory = useProvidedOrDefaultPathFactory(givenConfig.meta["installDirectory"])
      givenConfig.meta["installDirectory"] = useProvidedOrDefaultOnInstallDirectory(
        defaults.meta?.installDirectory,
        givenConfig.meta["installDirectory"],
        givenConfig.meta["appID"]
      )
      useProvidedOrDefaultOnInstallDirectory = useProvidedOrDefaultPathFactory(givenConfig.meta["installDirectory"])

      let useProvidedOrDefaultOnGeneratedConfigDirectory = useProvidedOrDefaultPathFactory(givenConfig.meta["generatedConfigDirectory"])
      givenConfig.meta["generatedConfigDirectory"] = useProvidedOrDefaultOnGeneratedConfigDirectory(
        defaults.meta?.generatedConfigDirectory,
        givenConfig.meta["generatedConfigDirectory"],
        givenConfig.meta["appID"]
      )
      useProvidedOrDefaultOnGeneratedConfigDirectory = useProvidedOrDefaultPathFactory(givenConfig.meta["generatedConfigDirectory"])

      const useProvidedOrDefaultOnOverridesDirectory = useProvidedOrDefaultPathFactory(givenConfig.meta["overridesDirectory"])
      givenConfig.meta["overridesDirectory"] = useProvidedOrDefaultOnOverridesDirectory(
        defaults.meta?.overridesDirectory,
        givenConfig.meta["overridesDirectory"],
        givenConfig.meta["appID"]
      )

      givenConfig.meta["dayZBinaryPath"] = useProvidedOrDefaultOnServerPath(defaults.meta?.dayZBinaryPath, givenConfig.meta["dayZBinaryPath"])
      givenConfig.meta["configPath"] = useProvidedOrDefaultOnServerPath(defaults.meta?.configPath, givenConfig.meta["configPath"])
      givenConfig.meta["bePath"] = useProvidedOrDefaultOnGeneratedConfigDirectory(defaults.meta?.bePath, givenConfig.meta["bePath"])

      givenConfig.meta["profilesPath"] = useProvidedOrDefaultOnDataDirectory(defaults.meta?.profilesPath, givenConfig.meta["profilesPath"])
      givenConfig.meta["modPath"] = useProvidedOrDefaultOnInstallDirectory(
        defaults.meta?.modPath,
        givenConfig.meta["modPath"],
        `${givenConfig.meta["modPath"]}/${givenConfig.meta["modAppID"]}`
      )
      givenConfig.meta["mapsPath"] = useProvidedOrDefaultOnInstallDirectory(defaults.meta?.mapsPath, givenConfig.meta["mapsPath"])

      if ("server" in givenConfig && typeof givenConfig.server === "object" && givenConfig.server !== null) {
        givenConfig.meta["missionPath"] = useProvidedOrDefaultOnInstallDirectory(
          defaults.meta?.missionPath,
          givenConfig.meta["missionPath"],
          `mpmissions/${givenConfig.server["template"]}`
        )

        if (givenConfig.server["enableWhitelist"] == null) givenConfig.server["enableWhitelist"] = !!givenConfig.meta["whitelist"]?.length
      }

      normalizeSteamConfig(givenConfig as { meta?: Record<string, unknown>; steam?: Record<string, unknown> }, defaults as { steam?: Partial<SteamConfig> })

      if (typeof givenConfig.meta["wipe"] === "string") {
        if (givenConfig.meta["wipe"] !== "dry-run") {
          if (String(givenConfig.meta["wipe"]).toLowerCase() === "true") givenConfig.meta["wipe"] = true
          if (String(givenConfig.meta["wipe"]).toLowerCase() === "false") givenConfig.meta["wipe"] = false
        }
      } else if (typeof givenConfig.meta["wipe"] !== "boolean") {
        givenConfig.meta["wipe"] = undefined
      }
    }
  }
  return givenConfig as R
}

export function useProvidedOrDefaultPathFactory(defaultDirectory: string) {
  if (typeof defaultDirectory !== "string") throw new Error("useProvidedOrDefaultPathFactory expects a string")
  return <T>(defaultValue: T, current: T | undefined, replacementSuffix?: string | number) => {
    if (current == null) return current
    if (typeof current !== "string" || typeof defaultValue !== "string") {
      if (current !== defaultValue) return current
    } else if (normalizeDefaultPath(current) !== normalizeDefaultPath(defaultValue)) {
      return current
    }

    const suffix = replacementSuffix ?? defaultValue
    if (suffix == null) return current
    return path.posix.join(defaultDirectory, String(suffix)) as T
  }
}

export function normalizeNumericBooleans(root: unknown, paths: readonly string[]): void {
  if (!isRecord(root)) return

  for (const path of paths) {
    const parts = path.split(".")
    let target: Record<string, unknown> = root

    for (const part of parts.slice(0, -1)) {
      const next = target[part]
      if (!isRecord(next)) {
        target = {}
        break
      }

      target = next
    }

    const key = parts[parts.length - 1]
    if (!key || !(key in target)) continue

    const value = target[key]
    if (value === 0 || value === "0") target[key] = false
    else if (value === 1 || value === "1") target[key] = true
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function normalizeDefaultPath(value: string) {
  const normalized = path.posix.normalize(value)
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "")
}

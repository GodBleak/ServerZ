import Ajv from "ajv"
import addFormats from "ajv-formats"
import ajvErrors from "ajv-errors"
import nodeConfig from "config"
import defaultConfigJson from "../../config/default.json" with { type: "json" }
import { ServerZSchema, type ConfigSchema } from "./schema.js"
import { isRecord, resolveConfig } from "./resolver.js"
import { type ServerZGeneratedConfig } from "../config.generated.js"
import { logger } from "../lib/logger.js"

let _config: ConfigSchema

const rawConfig = loadConfig()

if (typeof rawConfig !== "object" || rawConfig === null) throw new Error("Invalid ServerZ configuration")
const { serverz: defaultConfig } = defaultConfigJson
rawConfig["_defaults"] = defaultConfig
const resolvedConfig = resolveConfig(rawConfig, rawConfig["_defaults"] as ConfigSchema["_defaults"])

try {
  _config = validateConfig(resolvedConfig)
} catch (e) {
  console.error("Invalid ServerZ configuration:", e)
  process.exit(1)
}

export const config = _config as ServerZGeneratedConfig

const steamUsername = config.steam.steamUsername?.trim()
if (steamUsername && steamUsername !== "anonymous") logger.registerSecret(steamUsername, ellipsize(steamUsername))
const steamGuardCode = config.steam.steamGuardCode?.trim()
if (steamGuardCode) logger.registerSecret(steamGuardCode, ellipsize(steamGuardCode))
logger.registerSecret(config.steam.steamPassword)
logger.registerSecret(config.server.password)
logger.registerSecret(config.server.adminPassword)
logger.registerSecret(config.battleye.password)

logger.scrub().debug("Loaded config\n", nodeConfig.util.toObject(config))

if (config.meta.copyMission !== undefined)
  // oxlint-disable-next-line curly
  logger.warn(
    `⚠️  COPY_MISSION is deprecated and will be removed in a future release.
OverlayFS now protects mission persistence automatically during updates.

If you believe you still need COPY_MISSION, please open an issue:
https://gitlab.godbleak.dev/godbleak/ServerZ#issues`
  )

export function loadConfig(): unknown {
  return nodeConfig.get<unknown>("serverz")
}

export function validateConfig(givenConfig: unknown): ConfigSchema {
  const ajv = new Ajv({
    allErrors: true,
    coerceTypes: true,
    useDefaults: true,
  })
  ajv.addVocabulary(["env", "defaultDoc", "envFormat", "noDefault", "section"])
  addFormats(ajv)
  ajvErrors(ajv)

  const validate = ajv.compile(ServerZSchema)
  const validated = validate(givenConfig)
  if (validated) return givenConfig as ConfigSchema
  else throw validate.errors
}

export function hasExplicitConfigValue(path: readonly string[]): boolean {
  return getExplicitConfigSources().some((source) => hasPath(getServerZSourceValue(source), path))
}

type ConfigSourceLike = {
  name: string
  parsed?: unknown
}

function getServerZSourceValue(source: ConfigSourceLike): unknown {
  if (!isRecord(source.parsed)) return undefined
  return source.parsed["serverz"]
}

function getExplicitConfigSources(): ConfigSourceLike[] {
  return nodeConfig.util.getConfigSources().filter((source) => !/[/\\]default\.[^.]+$/i.test(source.name))
}

function hasPath(value: unknown, path: readonly string[]): boolean {
  let current = value

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) return false
    current = current[segment]
  }

  return true
}

function ellipsize(str: string): string {
  return `${str[0]}...${str[str.length - 1]}`
}

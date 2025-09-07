import "dotenv/config"
import { cpus } from "os"
import Ajv from "ajv"
import addFormats from "ajv-formats"
import { Type, Static } from "@sinclair/typebox"
import nodeConfig from "config"
import defaultConfigJson from "../config/default.json" with { "type": "json" }

const { serverz: defaultConfig } = defaultConfigJson

export const ServerZSchema = Type.Object(
    {
        meta: Type.Object({
            steamUsername: Type.String(),
            steamPassword: Type.String(),
            steamGuardCode: Type.Optional(Type.String()),

            appID: Type.Number(),
            steamBinaryPath: Type.String(),
            dayZBinaryPath: Type.String(),
            serverDirectory: Type.String(),
            port: Type.Number(),
            profilesPath: Type.String(),
            configPath: Type.String(),
            cpuCount: Type.Number(),

            doLogs: Type.Boolean(),
            adminLog: Type.Boolean(),
            netLog: Type.Boolean(),
            freezeCheck: Type.Boolean(),

            bePath: Type.String(),
            modList: Type.Array(Type.Number()),
            modAppID: Type.Number(),
            modPath: Type.String(),
            cleanMods: Type.Boolean(),
            extraStartupArgs: Type.Optional(Type.String()),

            skipUpdate: Type.Boolean(),
            skipMods: Type.Boolean(),
            skipMap: Type.Boolean(),
            startDayZServer: Type.Boolean(),

            mapURL: Type.String(),
            copyMission: Type.Boolean(),
            mapsPath: Type.String(),
            missionPath: Type.String(),
            updateMap: Type.Boolean(),
            exitWithChild: Type.Boolean(),
        }),

        server: Type.Object({
            serverName: Type.String(),
            description: Type.String(),
            password: Type.String(),
            adminPassword: Type.String(),
            maxPlayers: Type.Number(),

            verifySignatures: Type.Number(),
            forceSameBuild: Type.Number(),
            disableVon: Type.Number(),
            vonCodecQuality: Type.Number(),
            disable3rdPerson: Type.Number(),
            disableCrosshair: Type.Number(),

            serverTime: Type.String(),
            serverTimeAcceleration: Type.Number(),
            serverNightTimeAcceleration: Type.Number(),
            serverTimePersistent: Type.Number(),
            guaranteedUpdates: Type.Number(),

            loginQueueConcurrentPlayers: Type.Number(),
            loginQueueMaxPlayers: Type.Number(),
            instanceID: Type.Number(),
            storageAutoFix: Type.Number(),

            motd: Type.String(),
            motdInterval: Type.Number(),
            steamQueryPort: Type.Number(),
            respawnTime: Type.Number(),
            pingWarning: Type.Number(),
            pingCritical: Type.Number(),
            maxPing: Type.Number(),
            timestampFormat: Type.String(),
            logAverageFPS: Type.Number(),
            logMemory: Type.Number(),
            logPlayers: Type.Number(),
            logFile: Type.String(),

            adminLogPlayerHitsOnly: Type.Number(),
            adminLogPlacement: Type.Number(),
            adminLogBuildActions: Type.Number(),
            adminLogPlayerList: Type.Number(),
            enableDebugMonitor: Type.Number(),
            allowFilePatching: Type.Number(),
            simulatedPlayersBatch: Type.Number(),
            multithreadedReplication: Type.Number(),
            speedhackDetection: Type.Number(),

            networkRangeClose: Type.Number(),
            networkRangeNear: Type.Number(),
            networkRangeFar: Type.Number(),
            networkRangeDistantEffect: Type.Number(),
            networkObjectBatchLogSlow: Type.Number(),
            networkObjectBatchEnforceBandwidthLimits: Type.Number(),
            networkObjectBatchUseEstimatedBandwidth: Type.Number(),
            networkObjectBatchUseDynamicMaximumBandwidth: Type.Number(),
            networkObjectBatchBandwidthLimit: Type.Number(),
            networkObjectBatchCompute: Type.Number(),
            networkObjectBatchSendCreate: Type.Number(),
            networkObjectBatchSendDelete: Type.Number(),

            defaultVisibility: Type.Number(),
            defaultObjectViewDistance: Type.Number(),
            lightingConfig: Type.Number(),
            disablePersonalLight: Type.Number(),
            disableBaseDamage: Type.Number(),
            disableContainerDamage: Type.Number(),
            disableRespawnDialog: Type.Number(),
            serverFpsWarning: Type.Number(),
            shotValidation: Type.Number(),
            clientPort: Type.Number(),
            enableCfgGameplayFile: Type.Number(),
            template: Type.String(),
        }),

        battleye: Type.Object({
            ip: Type.Optional(Type.String()),
            port: Type.Optional(Type.String()),
            password: Type.Optional(Type.String()),
        }),
    },
    { additionalProperties: false }
)

export type ServerZConfig = Static<typeof ServerZSchema>

export function loadAndValidateConfig(): ServerZConfig {
    const ajv = new Ajv({
        allErrors: true,
        coerceTypes: true, // "2302" -> 2302, "true" -> true
        useDefaults: true, // applies defaults if you include them in TypeBox schema
    })
    addFormats(ajv)

    const validate = ajv.compile(ServerZSchema)
    const rawConfig = nodeConfig.get<unknown>("serverz")

    if (typeof rawConfig === "object" && rawConfig !== null) {
        if ("meta" in rawConfig && typeof rawConfig.meta === "object" && rawConfig.meta !== null) {
            if (!rawConfig.meta["cpuCount"]) rawConfig.meta["cpuCount"] = Math.floor(cpus().length / 2)

            if (typeof rawConfig.meta["modList"] === "string" && !Array.isArray(rawConfig.meta["modList"]))
                rawConfig.meta["modList"] = rawConfig.meta["modList"]
                    .split(",")
                    .map((m) => Number(m.trim()))
                    .filter((m) => Number.isFinite(m))
            if (typeof rawConfig.meta["modList"] !== "string" && !Array.isArray(rawConfig.meta["modList"])) rawConfig.meta["modList"] = []

            const useProvidedOrDefaultOnServerPath = useProvidedOrDefaultOnServerPathFactory(rawConfig.meta["serverDirectory"])

            rawConfig.meta["dayZBinaryPath"] = useProvidedOrDefaultOnServerPath(defaultConfig.meta["dayZBinaryPath"], rawConfig.meta["dayZBinaryPath"])
            rawConfig.meta["configPath"] = useProvidedOrDefaultOnServerPath(defaultConfig.meta["configPath"], rawConfig.meta["configPath"])
            rawConfig.meta["bePath"] = useProvidedOrDefaultOnServerPath(defaultConfig.meta["bePath"], rawConfig.meta["bePath"])
            rawConfig.meta["modPath"] = useProvidedOrDefaultOnServerPath(
                defaultConfig.meta["modPath"],
                rawConfig.meta["modPath"],
                `${rawConfig.meta["modPath"]}/${rawConfig.meta["modAppID"]}`
            )
            rawConfig.meta["mapsPath"] = useProvidedOrDefaultOnServerPath(defaultConfig.meta["mapsPath"], rawConfig.meta["mapsPath"])

            if ("server" in rawConfig && typeof rawConfig.server === "object" && rawConfig.server !== null)
                rawConfig.meta["missionPath"] = useProvidedOrDefaultOnServerPath(
                    defaultConfig.meta["missionPath"],
                    rawConfig.meta["missionPath"],
                    `mpmissions/${rawConfig.server["template"]}`
                )
        }
    }

    if (!validate(rawConfig)) {
        console.error("Invalid ServerZ configuration:", validate.errors)
        process.exit(1)
    }

    return rawConfig as ServerZConfig
}

export const config = loadAndValidateConfig()

function useProvidedOrDefaultOnServerPathFactory(serverDirectory: string) {
    return <T>(defaultValue: T, current: T | undefined, replacementSuffix?: string) => {
        if (current !== defaultValue) return current
        return `${serverDirectory}/${replacementSuffix ?? defaultValue}`
    }
}

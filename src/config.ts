import "dotenv/config";
import {cpus} from "os"

export let config = {
    meta:{
        steamUsername: process.env.STEAM_USERNAME,
        steamPassword: process.env.STEAM_PASSWORD,
        steamGuardCode: process.env.STEAM_GUARD_CODE,
        appID: parseInt(process.env.APP_ID || "223350"),
        steamBinaryPath: process.env.STEAM_BINARY_PATH || "/usr/games/steamcmd",
        dayZBinaryPath: "DayZServer",
        serverDirectory: process.env.SERVER_DIRECTORY || "/dayz",
        port: parseInt(process.env.PORT || "2302"),
        profilesPath: process.env.PROFILES_PATH || "/profiles",
        configPath: "serverDZ.generated.cfg",
        cpuCount: parseInt(process.env.CPU_COUNT || (cpus().length/2).toString()),
        doLogs: process.env.DO_LOGS?.toLowerCase() === "true",
        adminLog: process.env.ADMIN_LOG?.toLowerCase() === "true",
        netLog: process.env.NET_LOG?.toLowerCase() === "true",
        freezeCheck: process.env.FREEZE_CHECK?.toLowerCase() === "true",
        modList: (process.env.MOD_LIST || "").split(",").map((mod) => parseInt(mod.trim())).filter((mod) => !isNaN(mod)),
        modAppID: parseInt(process.env.MOD_APP_ID || "221100"),
        modPath: "steamapps/workshop/content",
        cleanMods: process.env.CLEAN_MODS?.toLowerCase() === "true",
        extraStartupArgs: process.env.EXTRA_STARTUP_ARGS,
        skipUpdate: process.env.SKIP_UPDATE?.toLowerCase() === "true",
        skipMods: process.env.SKIP_MODS?.toLowerCase() === "true",
        startDayZServer: process.env.START_DAYZ_SERVER?.toLowerCase() !== "false",
        mapURL: process.env.MAP_URL || "",
        copyMission: process.env.COPY_MISSION?.toLowerCase() === "true",
        mapsPath: "maps",
        missionPath: "",
        updateMap: process.env.UPDATE_MAP?.toLowerCase() === "true",
    },
    server: {
        serverName: process.env.SERVER_NAME || "Example Server",
        password: process.env.PASSWORD || "",
        adminPassword: process.env.ADMIN_PASSWORD || "",
        maxPlayers: parseInt(process.env.MAX_PLAYERS || "60"),
        verifySignatures: parseInt(process.env.VERIFY_SIGNATURES || "2"),
        forceSameBuild: parseInt(process.env.FORCE_SAME_BUILD || "0"),
        disableVon: parseInt(process.env.DISABLE_VON || "0"),
        vonCodecQuality: parseInt(process.env.VON_CODEC_QUALITY || "30"),
        disable3rdPerson: parseInt(process.env.DISABLE_3RD_PERSON || "0"),
        disableCrosshair: parseInt(process.env.DISABLE_CROSSHAIR || "1"),
        serverTime: process.env.SERVER_TIME || "SystemTime",
        serverTimeAcceleration: parseInt(process.env.SERVER_TIME_ACCELERATION || "3"),
        serverNightTimeAcceleration: parseInt(process.env.SERVER_NIGHT_TIME_ACCELERATION || "4"),
        serverTimePersistent: parseInt(process.env.SERVER_TIME_PERSISTENT || "1"),
        guaranteedUpdates: parseInt(process.env.GUARANTEED_UPDATES || "1"),
        loginQueueConcurrentPlayers: parseInt(process.env.LOGIN_QUEUE_CONCURRENT_PLAYERS || "5"),
        loginQueueMaxPlayers: parseInt(process.env.LOGIN_QUEUE_MAX_PLAYERS || "500"),
        instanceID: parseInt(process.env.INSTANCE_ID || "1"),
        storageAutoFix: parseInt(process.env.STORAGE_AUTO_FIX || "1"),
        motd: process.env.MOTD || "DayZ in a Box!",
        motdInterval: parseInt(process.env.MOTD_INTERVAL || "300"),
        steamQueryPort: parseInt(process.env.STEAM_QUERY_PORT || "2305"),
        respawnTime: parseInt(process.env.RESPAWN_TIME || "0"),
        pingWarning: parseInt(process.env.PING_WARNING || "200"),
        pingCritical: parseInt(process.env.PING_CRITICAL || "250"),
        maxPing: parseInt(process.env.MAX_PING || "300"),
        timestampFormat: process.env.TIMESTAMP_FORMAT || "Short",
        logAverageFPS: parseInt(process.env.LOG_AVERAGE_FPS || "3600"),
        logMemory: parseInt(process.env.LOG_MEMORY || "3600"),
        logPlayers: parseInt(process.env.LOG_PLAYERS || "3600"),
        logFile: process.env.LOG_FILE || "server_console.log",
        adminLogPlayerHitsOnly: parseInt(process.env.ADMIN_LOG_PLAYER_HITS_ONLY || "0"),
        adminLogPlacement: parseInt(process.env.ADMIN_LOG_PLACEMENT || "0"),
        adminLogBuildActions: parseInt(process.env.ADMIN_LOG_BUILD_ACTIONS || "0"),
        adminLogPlayerList: parseInt(process.env.ADMIN_LOG_PLAYER_LIST || "0"),
        enableDebugMonitor: parseInt(process.env.ENABLE_DEBUG_MONITOR || "0"),
        allowFilePatching: parseInt(process.env.ALLOW_FILE_PATCHING || "1"),
        simulatedPlayersBatch: parseInt(process.env.SIMULATED_PLAYERS_BATCH || "20"),
        multithreadedReplication: parseInt(process.env.MULTITHREADED_REPLICATION || "1"),
        speedhackDetection: parseInt(process.env.SPEEDHACK_DETECTION || "1"),
        networkRangeClose: parseInt(process.env.NETWORK_RANGE_CLOSE || "20"),
        networkRangeNear: parseInt(process.env.NETWORK_RANGE_NEAR || "150"),
        networkRangeFar: parseInt(process.env.NETWORK_RANGE_FAR || "1000"),
        networkRangeDistantEffect: parseInt(process.env.NETWORK_RANGE_DISTANT_EFFECT || "4000"),
        defaultVisibility: parseInt(process.env.DEFAULT_VISIBILITY || "1375"),
        defaultObjectViewDistance: parseInt(process.env.DEFAULT_OBJECT_VIEW_DISTANCE || "1375"),
        lightingConfig: parseInt(process.env.LIGHTING_CONFIG || "1"),
        disablePersonalLight: parseInt(process.env.DISABLE_PERSONAL_LIGHT || "1"),
        disableBaseDamage: parseInt(process.env.DISABLE_BASE_DAMAGE || "0"),
        disableContainerDamage: parseInt(process.env.DISABLE_CONTAINER_DAMAGE || "0"),
        disableRespawnDialog: parseInt(process.env.DISABLE_RESPAWN_DIALOG || "0"),
        lootHistory: parseInt(process.env.LOOT_HISTORY || "1"),
        storeHouseStateDisabled: process.env.STORE_HOUSE_STATE_DISABLED?.toLowerCase() === "true",
        serverFpsWarning: parseInt(process.env.SERVER_FPS_WARNING || "15"),
        shotValidation: parseInt(process.env.SHOT_VALIDATION || "1"),
        template: process.env.TEMPLATE || "dayzOffline.chernarusplus"
    }
}

config.meta.dayZBinaryPath = process.env.DAYZ_BINARY_PATH || `${config.meta.serverDirectory}/${config.meta.dayZBinaryPath}`;
config.meta.configPath = process.env.CONFIG_PATH || `${config.meta.serverDirectory}/${config.meta.configPath}`;
config.meta.modPath = process.env.MOD_PATH || `${config.meta.serverDirectory}/${config.meta.modPath}/${config.meta.modAppID}`;
config.meta.mapsPath = process.env.MAPS_PATH || `${config.meta.serverDirectory}/${config.meta.mapsPath}`;
config.meta.missionPath = process.env.MISSION_PATH || `${config.meta.serverDirectory}/mpmissions/${config.server.template}`;
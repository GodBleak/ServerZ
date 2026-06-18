import { Type, type Static } from "@sinclair/typebox"
import { SteamConfigSchema } from "../lib/steamapi/config.js"

export const ServerZSchema = Type.Object(
  {
    meta: Type.Object({
      appID: Type.Number({
        env: "APP_ID",
        default: 223350,
        description: "The Steam App ID for DayZ Server",
      }),
      dayZBinaryPath: Type.String({
        pattern: "^/",
        env: "DAYZ_BINARY_PATH",
        default: "DayZServer",
        description: "The path to the DayZ server binary",
        errorMessage: {
          pattern: "DAYZ_BINARY_PATH must be an absolute path",
        },
      }),
      installDirectory: Type.String({
        pattern: "^/",
        env: "INSTALL_DIRECTORY",
        defaultDoc: "`/install/${APP_ID}`",
        default: "/install/",
        description: "The directory where the server is installed. This should be bind-mounted to a persistent directory on the host.",
        errorMessage: {
          pattern: "INSTALL_DIRECTORY must be an absolute path",
        },
      }),
      serverDirectory: Type.String({
        pattern: "^/",
        env: "SERVER_DIRECTORY",
        defaultDoc: "`/dayz/${APP_ID}`",
        default: "/dayz/",
        description:
          "The directory in the container where the overlay filesystem is mounted. This is the merged view of `INSTALL_DIRECTORY`, `OVERRIDES_DIRECTORY`, `GENERATED_CONFIG_DIRECTORY`, and `DATA_DIRECTORY`.",
        errorMessage: {
          pattern: "SERVER_DIRECTORY must be an absolute path",
        },
      }),
      overridesDirectory: Type.String({
        pattern: "^/",
        env: "OVERRIDES_DIRECTORY",
        defaultDoc: "`/overrides/${APP_ID}`",
        default: "/overrides/",
        description: "The directory to override files in `INSTALL_DIRECTORY` with. This directory should be bind-mounted to the host.",
        errorMessage: {
          pattern: "OVERRIDES_DIRECTORY must be an absolute path",
        },
      }),
      overlayFSScratchDirectory: Type.String({
        pattern: "^/",
        env: "OVERLAY_FS_SCRATCH_DIRECTORY",
        defaultDoc: "`${DATA_DIRECTORY}/.overlay-work`",
        default: ".overlay-work",
        description: "The directory where OverlayFS stores its scratch space. Must be on the same filesystem as `DATA_DIRECTORY` (the upperdir).",
        errorMessage: {
          pattern: "OVERLAY_FS_SCRATCH_DIRECTORY must be an absolute path",
        },
      }),
      generatedConfigDirectory: Type.String({
        pattern: "^/",
        env: "GENERATED_CONFIG_DIRECTORY",
        defaultDoc: "`/tmp/serverz/dayz/${APP_ID}`",
        default: "/tmp/serverz/dayz/",
        description:
          "The directory where ServerZ stores configuration files it generated. This directory should not be bind-mounted to the host, ServerZ generates these files on startup.",
        errorMessage: {
          pattern: "GENERATED_CONFIG_DIRECTORY must be an absolute path",
        },
      }),
      dataDirectory: Type.String({
        pattern: "^/",
        env: "DATA_DIRECTORY",
        defaultDoc: "`/data/${APP_ID}`",
        default: "/data/",
        description: "The directory where DayZ writes are stored. This directory should be bind-mounted to the host.",
        errorMessage: {
          pattern: "DATA_DIRECTORY must be an absolute path",
        },
      }),
      port: Type.Number({
        env: "PORT",
        default: 2302,
        description: "The (game) port the server will run on",
        minimum: 1,
        maximum: 65535,
      }),
      profilesPath: Type.String({
        env: "PROFILES_PATH",
        defaultDoc: "`${DATA_DIRECTORY}/profiles`",
        default: "profiles",
        description: "The path to the profiles directory. If kept at the default location, this directory does not need to be bind-mounted to the host.",
      }),
      priority: Type.Array(
        Type.String({
          pattern: "^[0-9]{17}$",
          errorMessage: {
            pattern: "Each priority entry must be a quoted 17-digit SteamID64 string",
          },
        }),
        {
          env: "PRIORITY",
          defaultDoc: "`[]`",
          description: 'An array of player\'s SteamID64s to give queue priority to. Example: `\'["01234567890123456", "01234567890123456"]\'`',
          default: [],
          envFormat: "json",
        }
      ),
      configPath: Type.String({
        pattern: "^/",
        env: "CONFIG_PATH",
        defaultDoc: "`${SERVER_DIRECTORY}/serverDZ.generated.cfg`",
        default: "serverDZ.generated.cfg",
        description:
          "The path to the server configuration file, to be given to DayZServer. Changing this will result in all **Server** environment variables being ignored.",
        errorMessage: {
          pattern: "CONFIG_PATH must be an absolute path",
        },
      }),
      cpuCount: Type.Number({
        env: "CPU_COUNT",
        defaultDoc: "`cpus().length/2 (half of the CPUs available)`",
        description: "The number of CPU cores for DayZServer to use.",
      }),
      doLogs: Type.Boolean({
        env: "DO_LOGS",
        default: false,
        description: "adds -dologs to the server start command",
      }),
      adminLog: Type.Boolean({
        env: "ADMIN_LOG",
        default: false,
        description: "adds -adminlog to the server start command",
      }),
      netLog: Type.Boolean({
        env: "NET_LOG",
        default: false,
        description: "adds -netlog to the server start command",
      }),
      freezeCheck: Type.Boolean({
        env: "FREEZE_CHECK",
        default: false,
        description: "adds -freezecheck to the server start command",
      }),
      bePath: Type.String({
        env: "BE_PATH",
        defaultDoc: "`${GENERATED_CONFIG_DIRECTORY}/battleye`",
        default: "battleye",
        description: "The path to the BattlEye directory",
      }),
      modList: Type.Array(
        Type.Number({
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
        }),
        {
          env: "MOD_LIST",
          envFormat: "json",
          default: [],
          description: "AN array of mod IDs to download and enable on the server",
        }
      ),
      modAppID: Type.Number({
        env: "MOD_APP_ID",
        default: 221100,
        description: "The Steam App ID the workshop items (AKA: the mods) are associated with",
      }),
      modPath: Type.String({
        env: "MOD_PATH",
        defaultDoc: "`${INSTALL_DIRECTORY}/steamapps/workshop/content/${MOD_APP_ID}`",
        default: "steamapps/workshop/content",
        description: "The container path to where the downloaded workshop items can be found",
      }),
      cleanMods: Type.Boolean({
        env: "CLEAN_MODS",
        default: false,
        description:
          "On start, the server will uninstall and delete all mods not found in `MOD_LIST`. (Uninstallation is limited to reversing any actions performed by the server to install the mods, any other configuration (whether applied manually or by the mod itself) will remain)",
      }),
      extraStartupArgs: Type.Optional(
        Type.String({
          env: "EXTRA_STARTUP_ARGS",
          defaultDoc: "undefined",
          description: "Any additional arguments to pass to the server start command",
        })
      ),
      skipUpdate: Type.Boolean({
        env: "SKIP_UPDATE",
        default: false,
        description: "Skips the server update process",
      }),
      skipMods: Type.Boolean({
        env: "SKIP_MOD_UPDATE",
        default: false,
        description: "Skips the mod update process",
      }),
      skipMap: Type.Boolean({
        env: "SKIP_MAP_UPDATE",
        default: false,
        description: "Skips the map update process",
      }),
      startDayZServer: Type.Boolean({
        env: "START_DAYZ_SERVER",
        default: true,
        description: "Starts DayZServer. Set to false if, for example, you only want to update the server and mods.",
      }),
      mapURL: Type.Optional(
        Type.String({
          format: "uri",
          env: "MAP_URL",
          defaultDoc: "undefined",
          description: "The URL to download the map from. If set, ServerZ will download the map from the URL and symlink it into `MAPS_PATH`.",
          errorMessage: {
            format: "MAP_URL must be a valid URI",
          },
        })
      ),
      copyMission: Type.Optional(
        Type.Boolean({
          env: "COPY_MISSION",
          defaultDoc: "undefined",
          description:
            "**Deprecated.** When set to true, will copy the mission directory into `mpmissions`. This option is deprecated and will be removed in a future version. OverlayFS ensures all mission edits persist automatically. COPY_MISSION was a workaround for persistence that should no longer be needed. If OverlayFS doesn't replace this option for you, please let us know by creating an issue. See [readme.md#issues](../readme.md#issues)",
          deprecated: true,
        })
      ),
      copyMissionUp: Type.Optional(
        Type.Boolean({
          env: "COPY_MISSION_UP",
          defaultDoc: "undefined",
          description:
            "When `COPY_MISSION` is enabled, copy the mission into `OVERRIDES_DIRECTORY/mpmissions` instead of `INSTALL_DIRECTORY/mpmissions`. Useful when mission files should live with operator-managed overrides.",
        })
      ),
      mapsPath: Type.String({
        pattern: "^/",
        env: "MAPS_PATH",
        defaultDoc: "`${INSTALL_DIRECTORY}/maps`",
        default: "maps",
        description: "The container path to download maps to.",
        errorMessage: {
          pattern: "MAPS_PATH must be an absolute path",
        },
      }),
      missionPath: Type.String({
        pattern: "^/",
        env: "MISSION_PATH",
        defaultDoc: "`${INSTALL_DIRECTORY}/mpmissions/${TEMPLATE}`",
        default: "mpmissions/dayzOffline.chernarusplus",
        description:
          "The container path to the mission directory to symlink into `mpmissions`. For custom maps this would usually be `/dayz/maps/<mission>` and would not be a directory within the `mpmissions` directory.",
        errorMessage: {
          pattern: "MISSION_PATH must be an absolute path",
        },
      }),
      updateMap: Type.Boolean({
        env: "UPDATE_MAP",
        default: false,
        description: "When set to true, will overwrite any existing map when the server starts. Warning: this may cause data loss.",
      }),
      exitWithChild: Type.Boolean({
        env: "EXIT_WITH_CHILD",
        default: true,
        description: "When **not set to false**, the server will exit when the child process (DayZServer) exits.",
      }),
      shutdownTimeoutMs: Type.Number({
        env: "SHUTDOWN_TIMEOUT_MS",
        default: 60000,
        minimum: 0,
        description: "How long to wait after forwarding SIGTERM/SIGINT to DayZServer before resorting to SIGKILL.",
      }),
      useOverlayFS: Type.Boolean({
        env: "USE_OVERLAYFS",
        default: true,
        description:
          "**Enable overlay behavior.** When `true`, the server directory (`SERVER_DIRECTORY`, usually `/dayz`) is built as an overlay of the base install (`INSTALL_DIRECTORY`) plus operator overrides (`OVERRIDES_DIRECTORY`). Writes by the DayZ server are captured to `DATA_DIRECTORY`. When `false`, the system falls back to _copy mode_: all files are copied from base + overrides into the server directory on startup. Writes by the server may not persist across restarts.",
      }),
      useFuse: Type.Optional(
        Type.Boolean({
          env: "USE_FUSE",
          defaultDoc: "undefined",
          description:
            "**Choose overlay backend.** When `undefined`, ServerZ tries kernel OverlayFS first, then falls back to `fuse-overlayfs` if kernel mount fails. When `true`, ServerZ skips the kernel attempt and uses `fuse-overlayfs` directly (useful in rootless Docker/Podman). When `false`, ServerZ uses kernel OverlayFS only; if that fails, it falls back to copy mode instead of fuse.",
        })
      ),
      userXAttr: Type.Optional(
        Type.Boolean({
          env: "USE_USERXATTR",
          defaultDoc: "`false` when rootful, `true` when rootless",
          description: "Use user xattrs for overlayfs. You probably don't need to change this.",
        })
      ),
      wipe: Type.Optional(
        Type.Union([Type.Boolean(), Type.Literal("dry-run")], {
          env: "WIPE",
          defaultDoc: "undefined",
          description:
            "Wipe persistent server data before continuing startup. Set to `true` to perform the wipe, or `dry-run` to log what would be removed without deleting anything. After the wipe, the server will hang pending your intervention to unset this option and restart.",
        })
      ),
      wipeInstall: Type.Boolean({
        env: "WIPE_INSTALL",
        default: false,
        description:
          "Also wipe `INSTALL_DIRECTORY` when `WIPE` is enabled. By default, wipes target persistent data and profiles without deleting the installed server files.",
      }),
      wipeTimeout: Type.Number({
        env: "WIPE_TIMEOUT",
        default: 30,
        description: "Timeout (in seconds) for the wipe process. It's discouraged to set this lower than the default.",
      }),
      whitelist: Type.Array(
        Type.String({
          pattern: "^[A-Za-z0-9_-]{43}=$",
          errorMessage: {
            pattern: "Each whitelist entry must be a 44-character DayZ character ID. Ensure you're not using Steam IDs.",
          },
        }),
        {
          env: "WHITELIST",
          envFormat: "json",
          default: [],
          description: "Character IDs allowed to connect when whitelist is enabled.",
        }
      ),
      banned: Type.Array(
        Type.String({
          pattern: "^[0-9]{17}$",
          errorMessage: {
            pattern: "Each banned player entry must be a quoted 17-digit SteamID64 string",
          },
        }),
        {
          env: "BANLIST",
          envFormat: "json",
          default: [],
          description: "list of SteamID64s banned from connecting when banlist is enabled.",
        }
      ),
    }),

    server: Type.Object({
      serverName: Type.String({
        env: "SERVER_NAME",
        default: "Example Server",
        description: "The server name.",
      }),
      description: Type.String({
        env: "DESCRIPTION",
        default: "",
        description: "The server description.",
      }),
      password: Type.Optional(
        Type.String({
          env: "PASSWORD",
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "The server password.",
        })
      ),
      enableWhitelist: Type.Optional(
        Type.Boolean({
          env: "ENABLE_WHITELIST",
          defaultDoc: "`{!!WHITELIST.length}`",
          noDefault: true,
          description:
            "ENABLE_WHITELIST is set to `true` by default when `WHITELIST` is set. Set to `false` to explicitly disable it without needing to remove the whitelist.",
        })
      ),
      disableBanlist: Type.Boolean({
        env: "DISABLE_BANLIST",
        default: false,
        description: "Disables the banlist.",
      }),
      disablePrioritylist: Type.Boolean({
        env: "DISABLE_PRIORITYLIST",
        default: false,
        description: "Disables the prioritylist.",
      }),
      adminPassword: Type.Optional(
        Type.String({
          env: "ADMIN_PASSWORD",
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "The admin password.",
        })
      ),
      maxPlayers: Type.Number({
        env: "MAX_PLAYERS",
        default: 60,
        description: "The maximum number of players allowed on the server.",
      }),
      verifySignatures: Type.Number({
        env: "VERIFY_SIGNATURES",
        default: 2,
        description: "Verifies .pbos against .bisign files. (only 2 is supported)",
      }),
      forceSameBuild: Type.Boolean({
        env: "FORCE_SAME_BUILD",
        default: true,
        description: "When enabled, the server only allows clients with the same .exe revision as the server.",
      }),
      disableVon: Type.Boolean({
        env: "DISABLE_VON",
        default: false,
        description: "Disables VoN (Voice over Net) support.",
      }),
      vonCodecQuality: Type.Number({
        env: "VON_CODEC_QUALITY",
        default: 20,
        description: "Voice over network codec quality, the higher the better (values 0-20)",
      }),
      disable3rdPerson: Type.Boolean({
        env: "DISABLE_3RD_PERSON",
        default: false,
        description: "Disables third-person view for players.",
      }),
      disableCrosshair: Type.Boolean({
        env: "DISABLE_CROSSHAIR",
        default: true,
        description: "Disables the cross-hair.",
      }),
      serverTime: Type.String({
        env: "SERVER_TIME",
        default: "SystemTime",
        description:
          'Initial in-game time of the server. "SystemTime" means the local time of the machine. Another possibility is to set the time to some value in "YYYY/MM/DD/HH/MM" format, e.g "2015/4/8/17/23".',
      }),
      serverTimeAcceleration: Type.Number({
        env: "SERVER_TIME_ACCELERATION",
        default: 1,
        description:
          "Accelerated Time - The numerical value being a multiplier (0.1-64). Thus, in case it is set to 24, time would move 24 times faster than normal. An entire day would pass in one hour.",
      }),
      serverNightTimeAcceleration: Type.Number({
        env: "SERVER_NIGHT_TIME_ACCELERATION",
        default: 1,
        description:
          "Accelerated Nigh Time - The numerical value being a multiplier (0.1-64) and also multiplied by serverTimeAcceleration value. Thus, in case it is set to 4 and serverTimeAcceleration is set to 2, night time would move 8 times faster than normal. An entire night would pass in 3 hours.",
      }),
      serverTimePersistent: Type.Boolean({
        env: "SERVER_TIME_PERSISTENT",
        default: false,
        description: "When enabled, the actual server time is saved to storage and reused on the next server start.",
      }),
      guaranteedUpdates: Type.Number({
        env: "GUARANTEED_UPDATES",
        default: 1,
        description: "Communication protocol used with game server (use only number 1)",
      }),
      loginQueueConcurrentPlayers: Type.Number({
        env: "LOGIN_QUEUE_CONCURRENT_PLAYERS",
        default: 5,
        description:
          "The number of players concurrently processed during the login process. Should prevent massive performance drop during connection when a lot of people are connecting at the same time.",
      }),
      loginQueueMaxPlayers: Type.Number({
        env: "LOGIN_QUEUE_MAX_PLAYERS",
        default: 500,
        description: "The maximum number of players that can wait in login queue.",
      }),
      instanceID: Type.Number({
        env: "INSTANCE_ID",
        default: 1,
        description: "DayZ server instance id, to identify the number of instances per box and their storage folders with persistence files.",
      }),
      storageAutoFix: Type.Boolean({
        env: "STORAGE_AUTO_FIX",
        default: true,
        description: "When enabled, corrupted persistence files are replaced with empty ones.",
      }),
      // "Additional Parameters"
      respawnTime: Type.Optional(
        Type.Number({
          env: "RESPAWN_TIME",
          examples: [5],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Sets the respawn delay (in seconds) before the player is able to get a new character on the server, when the previous one is dead",
        })
      ),
      motd: Type.Array(Type.String(), {
        description: "Message of the day displayed in the in-game chat",
        default: ["DayZ in a Box!"],
        env: "MOTD",
        envFormat: "json",
        defaultDoc: "`'[\"DayZ in a Box!\"]'`",
      }),
      motdInterval: Type.Number({
        env: "MOTD_INTERVAL",
        default: 300,
        description: "Time interval (in seconds) between each message",
      }),
      timestampFormat: Type.Optional(
        Type.String({
          env: "TIMESTAMP_FORMAT",
          examples: ["Short"],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Format for timestamps in the .rpt file (value Full/Short)",
        })
      ),
      logAverageFPS: Type.Optional(
        Type.Number({
          env: "LOG_AVERAGE_FPS",
          examples: [1],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Logs the average server FPS (value in seconds), needs to have the DO_LOGS environment variable set",
        })
      ),
      logMemory: Type.Optional(
        Type.Number({
          env: "LOG_MEMORY",
          examples: [1],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Logs the server memory usage (value in seconds), needs to have the the DO_LOGS environment variable set",
        })
      ),
      logPlayers: Type.Optional(
        Type.Number({
          env: "LOG_PLAYERS",
          examples: [1],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Logs the count of currently connected players (value in seconds), needs to have the the DO_LOGS environment variable set",
        })
      ),
      logFile: Type.Optional(
        Type.String({
          env: "LOG_FILE",
          examples: ["server_console.log"],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Saves the server console log to a file in the folder with the other server logs",
        })
      ),
      adminLogPlayerHitsOnly: Type.Optional(
        Type.Boolean({
          env: "ADMIN_LOG_PLAYER_HITS_ONLY",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "When enabled, logs player hits only; when disabled, logs all hits, including animals and infected.",
        })
      ),
      adminLogPlacement: Type.Optional(
        Type.Boolean({
          env: "ADMIN_LOG_PLACEMENT",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "When enabled, logs placement actions, such as traps and tents.",
        })
      ),
      adminLogBuildActions: Type.Optional(
        Type.Boolean({
          env: "ADMIN_LOG_BUILD_ACTIONS",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "When enabled, logs base-building actions, such as build, dismantle, and destroy.",
        })
      ),
      adminLogPlayerList: Type.Optional(
        Type.Boolean({
          env: "ADMIN_LOG_PLAYER_LIST",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "When enabled, logs the periodic player list with positions every 5 minutes.",
        })
      ),
      disableMultiAccountMitigation: Type.Optional(
        Type.Boolean({
          env: "DISABLE_MULTI_ACCOUNT_MITIGATION",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Disables multi-account mitigation.",
        })
      ),
      enableDebugMonitor: Type.Optional(
        Type.Boolean({
          env: "ENABLE_DEBUG_MONITOR",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Shows character information using a debug window in a corner of the screen.",
        })
      ),
      steamQueryPort: Type.Number({
        env: "STEAM_QUERY_PORT",
        default: 27015,
        description:
          "defines Steam query port, should fix the issue with server not being visible in client server browser. (ServerZ Note: The default has been changed to what steam expects, and differs from Bohemia's default of 2305)",
      }),
      allowFilePatching: Type.Optional(
        Type.Boolean({
          env: "ALLOW_FILE_PATCHING",
          examples: [true],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: 'Enables connections from clients using the "-filePatching" launch parameter.',
        })
      ),
      simulatedPlayersBatch: Type.Optional(
        Type.Number({
          env: "SIMULATED_PLAYERS_BATCH",
          examples: [20],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Set limit of how much players can be simulated per frame (for server performance gain)",
        })
      ),
      multithreadedReplication: Type.Optional(
        Type.Boolean({
          env: "MULTITHREADED_REPLICATION",
          examples: [true],
          defaultDoc: "`undefined`",
          noDefault: true,
          description:
            'Enables multi-threaded processing of the server\'s replication system. Number of worker threads is derived by settings of jobsystem in dayzSettings.xml by "maxcores" and "reservedcores" parameters.',
        })
      ),
      speedhackDetection: Type.Optional(
        Type.Number({
          env: "SPEEDHACK_DETECTION",
          examples: [1],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "enable speedhack detection, values 1-10 (1 strict, 10 benevolent, can be float)",
        })
      ),
      networkRangeClose: Type.Optional(
        Type.Number({
          env: "NETWORK_RANGE_CLOSE",
          examples: [20],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "network bubble distance for spawn of close objects with items in them (f.i. backpacks), set in meters, default value if not set is 20",
        })
      ),
      networkRangeNear: Type.Optional(
        Type.Number({
          env: "NETWORK_RANGE_NEAR",
          examples: [150],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "network bubble distance for spawn (despawn +10%) of near inventory items objects, set in meters, default value if not set is 150",
        })
      ),
      networkRangeFar: Type.Optional(
        Type.Number({
          env: "NETWORK_RANGE_FAR",
          examples: [1000],
          defaultDoc: "`undefined`",
          noDefault: true,
          description:
            "network bubble distance for spawn (despawn +10%) of far objects (other than inventory items), set in meters, default value if not set is 1000",
        })
      ),
      networkRangeDistantEffect: Type.Optional(
        Type.Number({
          env: "NETWORK_RANGE_DISTANT_EFFECT",
          examples: [4000],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "network bubble distance for spawn of effects (currently only sound effects), set in meters, default value if not set is 4000",
        })
      ),
      networkObjectBatchLogSlow: Type.Optional(
        Type.Number({
          env: "NETWORK_OBJECT_BATCH_LOG_SLOW",
          examples: [5],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Maximum time a bubble can take to iterate in seconds before it is logged to the console",
        })
      ),
      networkObjectBatchEnforceBandwidthLimits: Type.Optional(
        Type.Boolean({
          env: "NETWORK_OBJECT_BATCH_ENFORCE_BANDWIDTH_LIMITS",
          examples: [true],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Enables a limiter for object creation based on bandwidth statistics.",
        })
      ),
      networkObjectBatchUseEstimatedBandwidth: Type.Optional(
        Type.Boolean({
          env: "NETWORK_OBJECT_BATCH_USE_ESTIMATED_BANDWIDTH",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "When disabled, bandwidth usage is based on actual data sent since the last server frame. When enabled, bandwidth usage is estimated.",
        })
      ),
      networkObjectBatchUseDynamicMaximumBandwidth: Type.Optional(
        Type.Boolean({
          env: "NETWORK_OBJECT_BATCH_USE_DYNAMIC_MAXIMUM_BANDWIDTH",
          examples: [true],
          defaultDoc: "`undefined`",
          noDefault: true,
          description:
            "When enabled, the bandwidth limit is a factor of the maximum bandwidth that can be sent. When disabled, the bandwidth limit is a hard limit.",
        })
      ),
      networkObjectBatchBandwidthLimit: Type.Optional(
        Type.Number({
          env: "NETWORK_OBJECT_BATCH_BANDWIDTH_LIMIT",
          examples: [0.8],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "The actual limit, could be a [0,1] value or a [1,inf] value depending on networkObjectBatchUseDynamicMaximumBandwidth. See above.",
        })
      ),
      networkObjectBatchCompute: Type.Optional(
        Type.Number({
          env: "NETWORK_OBJECT_BATCH_COMPUTE",
          examples: [1000],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Number of objects in the create/destroy lists that are checked in a single server frame",
        })
      ),
      networkObjectBatchSendCreate: Type.Optional(
        Type.Number({
          env: "NETWORK_OBJECT_BATCH_SEND_CREATE",
          examples: [10],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Maximum number of objects that can be sent for creation",
        })
      ),
      networkObjectBatchSendDelete: Type.Optional(
        Type.Number({
          env: "NETWORK_OBJECT_BATCH_SEND_DELETE",
          examples: [10],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Maximum number of objects that can be sent for deletion",
        })
      ),
      defaultVisibility: Type.Optional(
        Type.Number({
          env: "DEFAULT_VISIBILITY",
          examples: [1300],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: 'highest terrain render distance on server (if higher than "viewDistance=" in DayZ client profile, client-side parameter applies)',
        })
      ),
      defaultObjectViewDistance: Type.Optional(
        Type.Number({
          env: "DEFAULT_OBJECT_VIEW_DISTANCE",
          examples: [1375],
          defaultDoc: "`undefined`",
          noDefault: true,
          description:
            'highest object render distance on server (if higher than "preferredObjectViewDistance=" in DayZ client profile, client-side parameter applies)',
        })
      ),
      lightingConfig: Type.Optional(
        Type.Number({
          env: "LIGHTING_CONFIG",
          examples: [0],
          defaultDoc: "`undefined`",
          noDefault: true,
          description:
            "0 for brighter night, 1 for darker night, 2 for Sakhal-specific lighting - if enableCfgGameplayFile is enabled, this option will be overridden by the WorldsData::lightingConfig value",
        })
      ),
      disablePersonalLight: Type.Optional(
        Type.Boolean({
          env: "DISABLE_PERSONAL_LIGHT",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Disables personal light for all clients connected to the server.",
        })
      ),
      disableBaseDamage: Type.Optional(
        Type.Boolean({
          env: "DISABLE_BASE_DAMAGE",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "When enabled, disables damage and destruction of fences and watchtowers.",
        })
      ),
      disableContainerDamage: Type.Optional(
        Type.Boolean({
          env: "DISABLE_CONTAINER_DAMAGE",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "When enabled, disables damage and destruction of tents, barrels, wooden crates, and sea chests.",
        })
      ),
      disableRespawnDialog: Type.Optional(
        Type.Boolean({
          env: "DISABLE_RESPAWN_DIALOG",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "When enabled, disables the respawn dialog; new characters spawn randomly.",
        })
      ),
      pingWarning: Type.Optional(
        Type.Number({
          env: "PING_WARNING",
          examples: [200],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "set to define the ping value from which the initial yellow ping warning is triggered (value in milliseconds)",
        })
      ),
      pingCritical: Type.Optional(
        Type.Number({
          env: "PING_CRITICAL",
          examples: [250],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "set to define the ping value from which the red ping warning is triggered (value in milliseconds)",
        })
      ),
      maxPing: Type.Optional(
        Type.Number({
          env: "MAX_PING",
          examples: [300],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "set to define the ping value from which a player is kicked from the server (value in milliseconds)",
        })
      ),
      serverFpsWarning: Type.Optional(
        Type.Number({
          env: "SERVER_FPS_WARNING",
          examples: [15],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "set to define the server fps value under which the initial server fps warning is triggered (minimum value is 11)",
        })
      ),
      shotValidation: Type.Optional(
        Type.Boolean({
          env: "SHOT_VALIDATION",
          examples: [true],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Enables shot validation.",
        })
      ),
      clientPort: Type.Optional(
        Type.Number({
          env: "CLIENT_PORT",
          examples: [2304],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "forces the port the clients connect with",
        })
      ),
      enableCfgGameplayFile: Type.Optional(
        Type.Boolean({
          env: "ENABLE_CFG_GAMEPLAY_FILE",
          examples: [false],
          defaultDoc: "`undefined`",
          noDefault: true,
          description: "Enable support for the cfggameplay.json file.",
        })
      ),
      template: Type.String({
        /*
          The validation below ensuring the pattern `<fs-safe-string>.<fs-safe-string>` is a DayZ constraint.
          While the character set may be up for debate, the enforcement of a `.` surrounded by characters is not.
          Do not relax the pattern to allow `TEMPLATE` values that don't container a `.`.
          Source: https://community.bistudio.com/wiki/DayZ:Central_Economy_setup_for_custom_terrains#Mission_files:~:text=It%20is%20essential%20to%20follow%20this%20naming%20convention%20mission_name%2Eterrain_name%2E
        */
        pattern: "^[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+$",
        env: "TEMPLATE",
        default: "dayzOffline.chernarusplus",
        description: "Mission to load on server startup. <MissionName>.<TerrainName>",
      }),
    }),

    battleye: Type.Object({
      ip: Type.Optional(
        Type.String({
          env: "BE_IP",
          description: "BattlEye/RCon bind IP written to `beserver_x64.cfg`. Leave unset to let BattlEye use its default behavior.",
          defaultDoc: "`undefined`",
        })
      ),
      port: Type.Optional(
        Type.String({
          env: "BE_PORT",
          defaultDoc: "`undefined`",
          description: "BattlEye/RCon port written to `beserver_x64.cfg`. If unset, BattlEye uses its built-in default port behavior.",
        })
      ),
      password: Type.Optional(
        Type.String({
          env: "BE_PASSWORD",
          defaultDoc: "undefined",
          description: "Sets the password for the connection of the RCon tool (remote connection admin tool like BEC/Dart)",
        })
      ),
    }),

    steam: SteamConfigSchema,
  },
  { additionalProperties: true }
)

export type ServerZSchema = Static<typeof ServerZSchema>

const ConfigSchema = Type.Intersect([ServerZSchema, Type.Object({ _defaults: Type.Partial(ServerZSchema) })])

export type ConfigSchema = Static<typeof ConfigSchema>

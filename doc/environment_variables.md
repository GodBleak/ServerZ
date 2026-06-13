# Environment Variables

The environment variables are split into three sections: **Meta**, **Server**, and **Battle Eye**. **Server** variables translate to configuration options found in the typical `serverDZ.cfg` file and are used to generate such a file for the server. **Meta** variables control all other aspects of the server, such as Steam configuration, server files location, startup options, etc. **Battle Eye**, as the name suggests, is used to configure Battle Eye settings.

> 🔵 **Note:** This separation is superficial and is only used to organize the variables. When setting environment variables this separation does not need to be taken into consideration.

## Meta

<!-- env-doc:meta:start -->
| Variable | Default | Description |
| --- | --- | --- |
| `APP_ID` | `223350` | The Steam App ID for DayZ Server |
| `DAYZ_BINARY_PATH` | `DayZServer` | The path to the DayZ server binary |
| `INSTALL_DIRECTORY` | `/install/${APP_ID}` | The directory where the server is installed. This should be bind-mounted to a persistent directory on the host. |
| `SERVER_DIRECTORY` | `/dayz/${APP_ID}` | The directory in the container where the overlay filesystem is mounted. This is the merged view of `INSTALL_DIRECTORY`, `OVERRIDES_DIRECTORY`, `GENERATED_CONFIG_DIRECTORY`, and `DATA_DIRECTORY`. |
| `OVERRIDES_DIRECTORY` | `/overrides/${APP_ID}` | The directory to override files in `INSTALL_DIRECTORY` with. This directory should be bind-mounted to the host. |
| `OVERLAY_FS_SCRATCH_DIRECTORY` | `${DATA_DIRECTORY}/.overlay-work` | The directory where OverlayFS stores its scratch space. Must be on the same filesystem as `DATA_DIRECTORY` (the upperdir). |
| `GENERATED_CONFIG_DIRECTORY` | `/tmp/serverz/dayz/${APP_ID}` | The directory where ServerZ stores configuration files it generated. This directory should not be bind-mounted to the host, ServerZ generates these files on startup. |
| `DATA_DIRECTORY` | `/data/${APP_ID}` | The directory where DayZ writes are stored. This directory should be bind-mounted to the host. |
| `PORT` | `2302` | The (game) port the server will run on |
| `PROFILES_PATH` | `${DATA_DIRECTORY}/profiles` | The path to the profiles directory. If kept at the default location, this directory does not need to be bind-mounted to the host. |
| `PRIORITY` | `[]` | An array of player's SteamID64s to give queue priority to. Example: `'["01234567890123456", "01234567890123456"]'` |
| `CONFIG_PATH` | `${SERVER_DIRECTORY}/serverDZ.generated.cfg` | The path to the server configuration file, to be given to DayZServer. Changing this will result in all **Server** environment variables being ignored. |
| `CPU_COUNT` | `cpus().length/2 (half of the CPUs available)` | The number of CPU cores for DayZServer to use. |
| `DO_LOGS` | `false` | adds -dologs to the server start command |
| `ADMIN_LOG` | `false` | adds -adminlog to the server start command |
| `NET_LOG` | `false` | adds -netlog to the server start command |
| `FREEZE_CHECK` | `false` | adds -freezecheck to the server start command |
| `BE_PATH` | `${GENERATED_CONFIG_DIRECTORY}/battleye` | The path to the BattlEye directory |
| `MOD_LIST` | `[]` | AN array of mod IDs to download and enable on the server |
| `MOD_APP_ID` | `221100` | The Steam App ID the workshop items (AKA: the mods) are associated with |
| `MOD_PATH` | `${INSTALL_DIRECTORY}/steamapps/workshop/content/${MOD_APP_ID}` | The container path to where the downloaded workshop items can be found |
| `CLEAN_MODS` | `false` | On start, the server will uninstall and delete all mods not found in `MOD_LIST`. (Uninstallation is limited to reversing any actions performed by the server to install the mods, any other configuration (whether applied manually or by the mod itself) will remain) |
| `EXTRA_STARTUP_ARGS` | `undefined` | Any additional arguments to pass to the server start command |
| `SKIP_UPDATE` | `false` | Skips the server update process |
| `SKIP_MOD_UPDATE` | `false` | Skips the mod update process |
| `SKIP_MAP_UPDATE` | `false` | Skips the map update process |
| `START_DAYZ_SERVER` | `true` | Starts DayZServer. Set to false if, for example, you only want to update the server and mods. |
| `MAP_URL` | `undefined` | The URL to download the map from. If set, ServerZ will download the map from the URL and symlink it into `MAPS_PATH`. |
| `COPY_MISSION` | `undefined` | **Deprecated.** When set to true, will copy the mission directory into `mpmissions`. This option is deprecated and will be removed in a future version. OverlayFS ensures all mission edits persist automatically. COPY_MISSION was a workaround for persistence that should no longer be needed. If OverlayFS doesn't replace this option for you, please let us know by creating an issue. See [readme.md#issues](../readme.md#issues) |
| `COPY_MISSION_UP` | `undefined` | When `COPY_MISSION` is enabled, copy the mission into `OVERRIDES_DIRECTORY/mpmissions` instead of `INSTALL_DIRECTORY/mpmissions`. Useful when mission files should live with operator-managed overrides. |
| `MAPS_PATH` | `${INSTALL_DIRECTORY}/maps` | The container path to download maps to. |
| `MISSION_PATH` | `${INSTALL_DIRECTORY}/mpmissions/${TEMPLATE}` | The container path to the mission directory to symlink into `mpmissions`. For custom maps this would usually be `/dayz/maps/<mission>` and would not be a directory within the `mpmissions` directory. |
| `UPDATE_MAP` | `false` | When set to true, will overwrite any existing map when the server starts. Warning: this may cause data loss. |
| `EXIT_WITH_CHILD` | `true` | When **not set to false**, the server will exit when the child process (DayZServer) exits. |
| `SHUTDOWN_TIMEOUT_MS` | `60000` | How long to wait after forwarding SIGTERM/SIGINT to DayZServer before resorting to SIGKILL. |
| `USE_OVERLAYFS` | `true` | **Enable overlay behavior.** When `true`, the server directory (`SERVER_DIRECTORY`, usually `/dayz`) is built as an overlay of the base install (`INSTALL_DIRECTORY`) plus operator overrides (`OVERRIDES_DIRECTORY`). Writes by the DayZ server are captured to `DATA_DIRECTORY`. When `false`, the system falls back to _copy mode_: all files are copied from base + overrides into the server directory on startup. Writes by the server may not persist across restarts. |
| `USE_FUSE` | `undefined` | **Choose overlay backend.** When `undefined`, ServerZ tries kernel OverlayFS first, then falls back to `fuse-overlayfs` if kernel mount fails. When `true`, ServerZ skips the kernel attempt and uses `fuse-overlayfs` directly (useful in rootless Docker/Podman). When `false`, ServerZ uses kernel OverlayFS only; if that fails, it falls back to copy mode instead of fuse. |
| `USE_USERXATTR` | ``false` when rootful, `true` when rootless` | Use user xattrs for overlayfs. You probably don't need to change this. |
| `WIPE` | `undefined` | Wipe persistent server data before continuing startup. Set to `true` to perform the wipe, or `dry-run` to log what would be removed without deleting anything. After the wipe, the server will hang pending your intervention to unset this option and restart. |
| `WIPE_INSTALL` | `false` | Also wipe `INSTALL_DIRECTORY` when `WIPE` is enabled. By default, wipes target persistent data and profiles without deleting the installed server files. |
| `WIPE_TIMEOUT` | `30` | Timeout (in seconds) for the wipe process. It's discouraged to set this lower than the default. |
| `WHITELIST` | `[]` | Character IDs allowed to connect when whitelist is enabled. |
| `BANLIST` | `[]` | list of SteamID64s banned from connecting when banlist is enabled. |
| `STEAM_USERNAME` | `undefined` | The username for the Steam account to use for downloading the server and mods. User/password login is supported but discouraged; prefer QR code login & cached credentials. |
| `STEAM_PASSWORD` | `undefined` | The password for the Steam account to use for downloading the server and mods. Discouraged except for bootstrapping credentials. |
<!-- env-doc:meta:end -->

## Server

Most of the server env. variables are the UPPER*SNAKE_CASE version of camelCase configuration options found in the `serverDZ.cfg`/`server.cfg` file. However, this is **not** always the \_case* (e.g. `SERVER_NAME`, `ADMIN_PASSWORD`). For more information on what each variable does, refer to the [official DayZ configuration documentation](https://community.bistudio.com/wiki/DayZ:Server_Configuration#Configuration).

<!-- env-doc:server:start -->
| Variable | serverDZ.cfg | Default | Description |
| --- | --- | --- | --- |
| `SERVER_NAME` | `serverName` | `Example Server` | The server name. |
| `DESCRIPTION` | `description` | `` | The server description. |
| `PASSWORD` | `password` | `undefined` | The server password. |
| `ENABLE_WHITELIST` | `enableWhitelist` | `{!!WHITELIST.length}` | ENABLE_WHITELIST is set to `true` by default when `WHITELIST` is set. Set to `false` to explicitly disable it without needing to remove the whitelist. |
| `DISABLE_BANLIST` | `disableBanlist` | `false` | Disables the banlist. |
| `DISABLE_PRIORITYLIST` | `disablePrioritylist` | `false` | Disables the prioritylist. |
| `ADMIN_PASSWORD` | `adminPassword` | `undefined` | The admin password. |
| `MAX_PLAYERS` | `maxPlayers` | `60` | The maximum number of players allowed on the server. |
| `VERIFY_SIGNATURES` | `verifySignatures` | `2` | Verifies .pbos against .bisign files. (only 2 is supported) |
| `FORCE_SAME_BUILD` | `forceSameBuild` | `true` | When enabled, the server only allows clients with the same .exe revision as the server. |
| `DISABLE_VON` | `disableVon` | `false` | Disables VoN (Voice over Net) support. |
| `VON_CODEC_QUALITY` | `vonCodecQuality` | `20` | Voice over network codec quality, the higher the better (values 0-20) |
| `DISABLE_3RD_PERSON` | `disable3rdPerson` | `false` | Disables third-person view for players. |
| `DISABLE_CROSSHAIR` | `disableCrosshair` | `true` | Disables the cross-hair. |
| `SERVER_TIME` | `serverTime` | `SystemTime` | Initial in-game time of the server. "SystemTime" means the local time of the machine. Another possibility is to set the time to some value in "YYYY/MM/DD/HH/MM" format, e.g "2015/4/8/17/23". |
| `SERVER_TIME_ACCELERATION` | `serverTimeAcceleration` | `1` | Accelerated Time - The numerical value being a multiplier (0.1-64). Thus, in case it is set to 24, time would move 24 times faster than normal. An entire day would pass in one hour. |
| `SERVER_NIGHT_TIME_ACCELERATION` | `serverNightTimeAcceleration` | `1` | Accelerated Nigh Time - The numerical value being a multiplier (0.1-64) and also multiplied by serverTimeAcceleration value. Thus, in case it is set to 4 and serverTimeAcceleration is set to 2, night time would move 8 times faster than normal. An entire night would pass in 3 hours. |
| `SERVER_TIME_PERSISTENT` | `serverTimePersistent` | `false` | When enabled, the actual server time is saved to storage and reused on the next server start. |
| `GUARANTEED_UPDATES` | `guaranteedUpdates` | `1` | Communication protocol used with game server (use only number 1) |
| `LOGIN_QUEUE_CONCURRENT_PLAYERS` | `loginQueueConcurrentPlayers` | `5` | The number of players concurrently processed during the login process. Should prevent massive performance drop during connection when a lot of people are connecting at the same time. |
| `LOGIN_QUEUE_MAX_PLAYERS` | `loginQueueMaxPlayers` | `500` | The maximum number of players that can wait in login queue. |
| `INSTANCE_ID` | `instanceID` | `1` | DayZ server instance id, to identify the number of instances per box and their storage folders with persistence files. |
| `STORAGE_AUTO_FIX` | `storageAutoFix` | `true` | When enabled, corrupted persistence files are replaced with empty ones. |
| `RESPAWN_TIME` | `respawnTime` | `undefined` | Sets the respawn delay (in seconds) before the player is able to get a new character on the server, when the previous one is dead |
| `MOTD` | `motd` | `'["DayZ in a Box!"]'` | Message of the day displayed in the in-game chat |
| `MOTD_INTERVAL` | `motdInterval` | `300` | Time interval (in seconds) between each message |
| `TIMESTAMP_FORMAT` | `timestampFormat` | `undefined` | Format for timestamps in the .rpt file (value Full/Short) |
| `LOG_AVERAGE_FPS` | `logAverageFPS` | `undefined` | Logs the average server FPS (value in seconds), needs to have the DO_LOGS environment variable set |
| `LOG_MEMORY` | `logMemory` | `undefined` | Logs the server memory usage (value in seconds), needs to have the the DO_LOGS environment variable set |
| `LOG_PLAYERS` | `logPlayers` | `undefined` | Logs the count of currently connected players (value in seconds), needs to have the the DO_LOGS environment variable set |
| `LOG_FILE` | `logFile` | `undefined` | Saves the server console log to a file in the folder with the other server logs |
| `ADMIN_LOG_PLAYER_HITS_ONLY` | `adminLogPlayerHitsOnly` | `undefined` | When enabled, logs player hits only; when disabled, logs all hits, including animals and infected. |
| `ADMIN_LOG_PLACEMENT` | `adminLogPlacement` | `undefined` | When enabled, logs placement actions, such as traps and tents. |
| `ADMIN_LOG_BUILD_ACTIONS` | `adminLogBuildActions` | `undefined` | When enabled, logs base-building actions, such as build, dismantle, and destroy. |
| `ADMIN_LOG_PLAYER_LIST` | `adminLogPlayerList` | `undefined` | When enabled, logs the periodic player list with positions every 5 minutes. |
| `DISABLE_MULTI_ACCOUNT_MITIGATION` | `disableMultiAccountMitigation` | `undefined` | Disables multi-account mitigation. |
| `ENABLE_DEBUG_MONITOR` | `enableDebugMonitor` | `undefined` | Shows character information using a debug window in a corner of the screen. |
| `STEAM_QUERY_PORT` | `steamQueryPort` | `27015` | defines Steam query port, should fix the issue with server not being visible in client server browser. (ServerZ Note: The default has been changed to what steam expects, and differs from Bohemia's default of 2305) |
| `ALLOW_FILE_PATCHING` | `allowFilePatching` | `undefined` | Enables connections from clients using the "-filePatching" launch parameter. |
| `SIMULATED_PLAYERS_BATCH` | `simulatedPlayersBatch` | `undefined` | Set limit of how much players can be simulated per frame (for server performance gain) |
| `MULTITHREADED_REPLICATION` | `multithreadedReplication` | `undefined` | Enables multi-threaded processing of the server's replication system. Number of worker threads is derived by settings of jobsystem in dayzSettings.xml by "maxcores" and "reservedcores" parameters. |
| `SPEEDHACK_DETECTION` | `speedhackDetection` | `undefined` | enable speedhack detection, values 1-10 (1 strict, 10 benevolent, can be float) |
| `NETWORK_RANGE_CLOSE` | `networkRangeClose` | `undefined` | network bubble distance for spawn of close objects with items in them (f.i. backpacks), set in meters, default value if not set is 20 |
| `NETWORK_RANGE_NEAR` | `networkRangeNear` | `undefined` | network bubble distance for spawn (despawn +10%) of near inventory items objects, set in meters, default value if not set is 150 |
| `NETWORK_RANGE_FAR` | `networkRangeFar` | `undefined` | network bubble distance for spawn (despawn +10%) of far objects (other than inventory items), set in meters, default value if not set is 1000 |
| `NETWORK_RANGE_DISTANT_EFFECT` | `networkRangeDistantEffect` | `undefined` | network bubble distance for spawn of effects (currently only sound effects), set in meters, default value if not set is 4000 |
| `NETWORK_OBJECT_BATCH_LOG_SLOW` | `networkObjectBatchLogSlow` | `undefined` | Maximum time a bubble can take to iterate in seconds before it is logged to the console |
| `NETWORK_OBJECT_BATCH_ENFORCE_BANDWIDTH_LIMITS` | `networkObjectBatchEnforceBandwidthLimits` | `undefined` | Enables a limiter for object creation based on bandwidth statistics. |
| `NETWORK_OBJECT_BATCH_USE_ESTIMATED_BANDWIDTH` | `networkObjectBatchUseEstimatedBandwidth` | `undefined` | When disabled, bandwidth usage is based on actual data sent since the last server frame. When enabled, bandwidth usage is estimated. |
| `NETWORK_OBJECT_BATCH_USE_DYNAMIC_MAXIMUM_BANDWIDTH` | `networkObjectBatchUseDynamicMaximumBandwidth` | `undefined` | When enabled, the bandwidth limit is a factor of the maximum bandwidth that can be sent. When disabled, the bandwidth limit is a hard limit. |
| `NETWORK_OBJECT_BATCH_BANDWIDTH_LIMIT` | `networkObjectBatchBandwidthLimit` | `undefined` | The actual limit, could be a [0,1] value or a [1,inf] value depending on networkObjectBatchUseDynamicMaximumBandwidth. See above. |
| `NETWORK_OBJECT_BATCH_COMPUTE` | `networkObjectBatchCompute` | `undefined` | Number of objects in the create/destroy lists that are checked in a single server frame |
| `NETWORK_OBJECT_BATCH_SEND_CREATE` | `networkObjectBatchSendCreate` | `undefined` | Maximum number of objects that can be sent for creation |
| `NETWORK_OBJECT_BATCH_SEND_DELETE` | `networkObjectBatchSendDelete` | `undefined` | Maximum number of objects that can be sent for deletion |
| `DEFAULT_VISIBILITY` | `defaultVisibility` | `undefined` | highest terrain render distance on server (if higher than "viewDistance=" in DayZ client profile, client-side parameter applies) |
| `DEFAULT_OBJECT_VIEW_DISTANCE` | `defaultObjectViewDistance` | `undefined` | highest object render distance on server (if higher than "preferredObjectViewDistance=" in DayZ client profile, client-side parameter applies) |
| `LIGHTING_CONFIG` | `lightingConfig` | `undefined` | 0 for brighter night, 1 for darker night, 2 for Sakhal-specific lighting - if enableCfgGameplayFile is enabled, this option will be overridden by the WorldsData::lightingConfig value |
| `DISABLE_PERSONAL_LIGHT` | `disablePersonalLight` | `undefined` | Disables personal light for all clients connected to the server. |
| `DISABLE_BASE_DAMAGE` | `disableBaseDamage` | `undefined` | When enabled, disables damage and destruction of fences and watchtowers. |
| `DISABLE_CONTAINER_DAMAGE` | `disableContainerDamage` | `undefined` | When enabled, disables damage and destruction of tents, barrels, wooden crates, and sea chests. |
| `DISABLE_RESPAWN_DIALOG` | `disableRespawnDialog` | `undefined` | When enabled, disables the respawn dialog; new characters spawn randomly. |
| `PING_WARNING` | `pingWarning` | `undefined` | set to define the ping value from which the initial yellow ping warning is triggered (value in milliseconds) |
| `PING_CRITICAL` | `pingCritical` | `undefined` | set to define the ping value from which the red ping warning is triggered (value in milliseconds) |
| `MAX_PING` | `maxPing` | `undefined` | set to define the ping value from which a player is kicked from the server (value in milliseconds) |
| `SERVER_FPS_WARNING` | `serverFpsWarning` | `undefined` | set to define the server fps value under which the initial server fps warning is triggered (minimum value is 11) |
| `SHOT_VALIDATION` | `shotValidation` | `undefined` | Enables shot validation. |
| `CLIENT_PORT` | `clientPort` | `undefined` | forces the port the clients connect with |
| `ENABLE_CFG_GAMEPLAY_FILE` | `enableCfgGameplayFile` | `undefined` | Enable support for the cfggameplay.json file. |
| `TEMPLATE` | `template` | `dayzOffline.chernarusplus` | Mission to load on server startup. <MissionName>.<TerrainName> |
| `STEAM_GUARD_CODE` | `steamGuardCode` | `undefined` | The Steam Guard code/token for bootstrapping a Steam login when required. |
<!-- env-doc:server:end -->

## BattlEye

Unless any of the following variables are set, no BattlEye configuration will be generated.

<!-- env-doc:battleye:start -->
| Variable | beserver_x64.cfg | Default | Description |
| --- | --- | --- | --- |
| `BE_IP` | `ip` | `undefined` | BattlEye/RCon bind IP written to `beserver_x64.cfg`. Leave unset to let BattlEye use its default behavior. |
| `BE_PORT` | `port` | `undefined` | BattlEye/RCon port written to `beserver_x64.cfg`. If unset, BattlEye uses its built-in default port behavior. |
| `BE_PASSWORD` | `password` | `undefined` | Sets the password for the connection of the RCon tool (remote connection admin tool like BEC/Dart) |
<!-- env-doc:battleye:end -->

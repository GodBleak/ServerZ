# Environment Variables

The environment variables are split into three sections: **Meta**, **Server**, and **Battle Eye**. **Server** variables translate to configuration options found in the typical `serverDZ.cfg` file and are used to generate such a file for the server. **Meta** variables control all other aspects of the server, such as Steam configuration, server files location, startup options, etc. **Battle Eye**, as the name suggests, is used to configure Battle Eye settings.

> 🔵 **Note:** This separation is superficial and is only used to organize the variables. When setting environment variables this separation does not need to be taken into consideration.

## Meta

| Variable           | Default                                                        | Description                                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STEAM_BINARY_PATH  | /usr/games/steamcmd                                            | Path to the steamcmd binary                                                                                                                                                                                                                                            |
| APP_ID             | 223350                                                         | The Steam App ID for DayZ Server                                                                                                                                                                                                                                       |
| PORT               | 2302                                                           | The (game) port the server will run on                                                                                                                                                                                                                                 |
| PROFILES_PATH      | /profiles                                                      | The path to the profiles directory                                                                                                                                                                                                                                     |
| CONFIG_PATH        | `${SERVER_DIRECTORY}/serverDZ.generated.cfg`                   | The path to the server configuration file. Changing this will result in all **Server** environment variables being ignored.                                                                                                                                            |
| CPU_COUNT          | cpus().length/2 (or half of the CPUs available)                | The number of cores the server will use                                                                                                                                                                                                                                |
| MOD_LIST           |                                                                | A comma separated list of mod IDs to download and enable on the server                                                                                                                                                                                                 |
| MOD_APP_ID         | 221100                                                         | The Steam App ID the workshop items (AKA: the mods) are associated with                                                                                                                                                                                                |
| MODS_PATH          | `${SERVER_DIRECTORY}/steamapps/workshop/content/${MOD_APP_ID}` | The path to where the downloaded workshop items can be found                                                                                                                                                                                                           |
| CLEAN_MODS         | false                                                          | On start, the server will uninstall and delete all mods not found in `MOD_LIST`. (Uninstallation is limited to reversing any actions performed by the server to install the mods, any other configuration (whether applied manually or by the mod itself) will remain) |
| STEAM_USERNAME     | anonymous                                                      | The username for the Steam account to use for downloading the server and mods                                                                                                                                                                                          |
| STEAM_PASSWORD     |                                                                | The password for the Steam account to use for downloading the server and mods                                                                                                                                                                                          |
| STEAM_GUARD_CODE   |                                                                | The Steam Guard code for the Steam account to use for downloading the server and mods                                                                                                                                                                                  |
| SERVER_DIRECTORY   | /dayz                                                          | The directory to install the server and mods into                                                                                                                                                                                                                      |
| DO_LOGS            | false                                                          | adds -dologs to the server start command                                                                                                                                                                                                                               |
| ADMIN_LOG          | false                                                          | adds -adminlog to the server start command                                                                                                                                                                                                                             |
| NET_LOG            | false                                                          | adds -netlog to the server start command                                                                                                                                                                                                                               |
| FREEZE_CHECK       | false                                                          | adds -freezecheck to the server start command                                                                                                                                                                                                                          |
| BE_PATH            | `${SERVER_DIRECTORY}/battleye`                                 | The path to the BattlEye directory                                                                                                                                                                                                                                     |
| EXTRA_STARTUP_ARGS |                                                                | Any additional arguments to pass to the server start command                                                                                                                                                                                                           |
| SKIP_UPDATE        | false                                                          | Skips the server update process                                                                                                                                                                                                                                        |
| SKIP_MOD_UPDATE    | false                                                          | Skips the mod update process                                                                                                                                                                                                                                           |
| START_DAYZ_SERVER  | true                                                           | Starts DayZServer. Set to false if you, for example, only want to update the server and mods.                                                                                                                                                                          |
| MAPS_PATH          | `${SERVER_DIRECTORY}/maps`                                     | The path to download maps to.                                                                                                                                                                                                                                          |
| MAP_URL            |                                                                | The URL to download the map from.                                                                                                                                                                                                                                      |
| COPY_MISSION       | false                                                          | When set to true, will copy the mission directory (specified by MISSION_PATH) to the `mpmissions` directory, instead of symlinking it.                                                                                                                                 |
| MISSION_PATH       | `${SERVER_DIRECTORY}/mpmissions/dayzOffline.chernarusplus`     | The path to the mission directory to symlink into `mpmissions`. For custom maps this would usually be `/dayz/maps/<mission>` and would not be a directory within the `mpmissions` directory.                                                                           |
| UPDATE_MAP         | false                                                          | When set to true, will overwrite any existing map when the server starts. Warning: this may cause data loss.                                                                                                                                                           |
| EXIT_WITH_CHILD    | true                                                           | When not set to false, the server will exit when the child process (DayZServer) exits.                                                                                                                                                                                 |

## Server

Most of the server env. variables are the UPPER*SNAKE_CASE version of camelCase configuration options found in the `serverDZ.cfg`/`server.cfg` file. However, this is **not** always the \_case* (e.g. `SERVER_NAME`, `ADMIN_PASSWORD`). For more information on what each variable does, refer to the [official DayZ configuration documentation](https://community.bistudio.com/wiki/DayZ:Server_Configuration#Configuration).
| Variable | serverDZ.cfg | Default |
|---|---|---|
| SERVER_NAME | hostname | Example Server |
| PASSWORD | password | |
| DESCRIPTION | description | |
| ADMIN_PASSWORD | passwordAdmin | |
| MAX_PLAYERS | maxPlayers | 60 |
| VERIFY_SIGNATURES | verifySignatures | 2 |
| FORCE_SAME_BUILD | forceSameBuild | 0 |
| DISABLE_VON | disableVoN | 0 |
| VON_CODEC_QUALITY | vonCodecQuality | 30 |
| DISABLE_3RD_PERSON | disable3rdPerson | 0 |
| DISABLE_CROSSHAIR | disableCrosshair | 1 |
| SERVER_TIME | serverTime | SystemTime |
| SERVER_TIME_ACCELERATION | serverTimeAcceleration | 3 |
| SERVER_NIGHT_TIME_ACCELERATION | serverNightTimeAcceleration | 4 |
| SERVER_TIME_PERSISTENT | serverTimePersistent | 1 |
| GUARANTEED_UPDATES | guaranteedUpdates | 1 |
| LOGIN_QUEUE_CONCURRENT_PLAYERS | loginQueueConcurrentPlayers | 5 |
| LOGIN_QUEUE_MAX_PLAYERS | loginQueueMaxPlayers | 500 |
| INSTANCE_ID | instanceId | 1 |
| STORAGE_AUTO_FIX | storageAutoFix | 1 |
| MOTD | motd | DayZ in a Box! |
| MOTD_INTERVAL | motdInterval | 300 |
| STEAM_QUERY_PORT | steamQueryPort | 2305 |
| RESPAWN_TIME | respawnTime | 0 |
| PING_WARNING | pingWarning | 200 |
| PING_CRITICAL | pingCritical | 250 |
| MAX_PING | MaxPing | 300 |
| TIMESTAMP_FORMAT | timeStampFormat | Short |
| LOG_AVERAGE_FPS | logAverageFPS | 3600 |
| LOG_MEMORY | logMemory | 3600 |
| LOG_PLAYERS | logPlayers | 3600 |
| LOG_FILE | logFile | server_console.log |
| ADMIN_LOG_PLAYER_HITS_ONLY | adminLogPlayerHitsOnly | 0 |
| ADMIN_LOG_PLACEMENT | adminLogPlacement | 0 |
| ADMIN_LOG_BUILD_ACTIONS | adminLogBuildActions | 0 |
| ADMIN_LOG_PLAYER_LIST | adminLogPlayerList | 0 |
| ENABLE_DEBUG_MONITOR | enableDebugMonitor | 0 |
| ALLOW_FILE_PATCHING | allowFilePatching | 1 |
| SIMULATED_PLAYERS_BATCH | simulatedPlayersBatch | 20 |
| MULTITHREADED_REPLICATION | multithreadedReplication | 1 |
| SPEEDHACK_DETECTION | speedhackDetection | 1 |
| NETWORK_RANGE_CLOSE | networkRangeClose | 20 |
| NETWORK_RANGE_NEAR | networkRangeNear | 150 |
| NETWORK_RANGE_FAR | networkRangeFar | 1000 |
| NETWORK_RANGE_DISTANT_EFFECT | networkRangeDistantEffect | 4000 |
| NETWORK_OBJECT_BATCH_LOG_SLOW | networkObjectBatchLogSlow | 5 |
| NETWORK_OBJECT_BATCH_ENFORCE_BANDWIDTH_LIMITS | networkObjectBatchEnforceBandwidthLimits | 1 |
| NETWORK_OBJECT_BATCH_USE_ESTIMATED_BANDWIDTH | networkObjectBatchUseEstimatedBandwidth | 0 |
| NETWORK_OBJECT_BATCH_USE_DYNAMIC_MAXIMUM_BANDWIDTH | networkObjectBatchUseDynamicMaximumBandwidth | 1 |
| NETWORK_OBJECT_BATCH_BANDWIDTH_LIMIT | networkObjectBatchBandwidthLimit | 0.8 |
| NETWORK_OBJECT_BATCH_COMPUTE | networkObjectBatchCompute | 1000 |
| NETWORK_OBJECT_BATCH_SEND_CREATE | networkObjectBatchSendCreate | 10 |
| NETWORK_OBJECT_BATCH_BANDWIDTH_LIMIT | networkObjectBatchSendDelete | 10 |
| DEFAULT_VISIBILITY | defaultVisibility | 1375 |
| DEFAULT_OBJECT_VIEW_DISTANCE | defaultObjectViewDistance | 1375 |
| LIGHTING_CONFIG | lightingConfig | 1 |
| DISABLE_PERSONAL_LIGHT | disablePersonalLight | 1 |
| DISABLE_BASE_DAMAGE | disableBaseDamage | 0 |
| DISABLE_CONTAINER_DAMAGE | disableContainerDamage | 0 |
| DISABLE_RESPAWN_DIALOG | disableRespawnDialog | 0 |
| SERVER_FPS_WARNING | serverFPSWarning | 15 |
| SHOT_VALIDATION | shotValidation | 1 |
| TEMPLATE | `Missions.DayZ.template` | dayzOffline.chernarusplus |

## BattlEye

Unless any of the following variables are set, no BattlEye configuration will be generated.

| Variable    | beserver_x64.cfg | Description                            |
| ----------- | ---------------- | -------------------------------------- |
| BE_IP       | RConIP           | The IP the BattlEye RCon will bind to  |
| BE_PORT     | RConPort         | The port the BattlEye RCon will run on |
| BE_PASSWORD | RConPassword     | The password for the BattlEye RCon     |

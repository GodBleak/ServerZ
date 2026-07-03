# Tested Maps

The following maps have been tested with ServerZ. Tests include setting up the server with the `compose.yml` file listed, bringing the server up, connecting to the server, and moving the player a few steps away from the spawn point \*. Given its ubiquity, [CF](https://steamcommunity.com/workshop/filedetails/?id=1559212036) was an assumed requirement for all maps. Between each test the server is wiped using the `WIPE` configuration option. All maps are tested using rootless Podman.

<details>
<summary>* Note</summary>
Special instructions provided for maps are also followed so long as they're compatible with the philosophy of ServerZ. If maps don't meet that requirement, they're still given an ❌. So even if you see in the list below that a map is "incompatible" you may want to follow the link to determine if you can make it work in your setup.
</details>

<!-- #maps -->

## Maps

- [Namalsk](#namalsk-) ✅
- [Deer Isle](#deer-isle-) ✅
- [Chiemsee](#chiemsee-) ✅
- [Rostow](#rostow-) ❌
- [Esseker](#esseker-) ✅
- [Takistan Plus](#takistan-plus-) ❌
- [Banov](#banov-) ✅
- [Swans Island](#swans-island-) ✅
- [PripyatGamma](#pripyatgamma-) ✅
- [Iztek](#iztek-) ✅
- [Melkart](#melkart-) ❌
- [Stuart Island](#stuart-island-) ✅
- [Alteria](#alteria-) ✅
- [Yiprit](#yiprit-) ❌
- [Nyheim](#nyheim-) ✅
- [Bitterroot](#bitterroot-) ✅
- [Anastara](#anastara-) ✅
- [Green County](#green-county-) ✅
- [Raman](#raman-) ❌
- [Deadfall](#deadfall-) ✅
- [Valning](#valning-) ❌
- [Vela](#vela-) ❌
- [Lux](#lux-) ✅
- [PNW](#pnw-) ✅
- [Arsteinen](#arsteinen-) ✅
- [Newyork](#newyork-) ✅

### [Namalsk](https://namalsk.com/) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

Mod ids `2289456201` for Namalsk Island and `2289461232` for Namalsk Survival were added to `MOD_LIST` to retrieve the `meta.cpp` files to be used to mask the server variants being used, as per the Namalsk-Server documentation. The server was started with `START_DAYZ_SERVER` set to `false` to download the mods without starting the server.

Once downloaded the server was stopped, the following commands were ran on my host to override the `meta.cpp` files.

```bash
mkdir -p /data/dayz/testing/overrides/223350/@Namalsk\ Island\ \(server\)
mkdir -p /data/dayz/testing/overrides/223350/@Namalsk\ Survival\ \(server\)
cp /data/dayz/testing/install/223350/@Namalsk\ Island/meta.cpp /data/dayz/testing/overrides/223350/@Namalsk\ Island\ \(server\)
cp /data/dayz/testing/install/223350/@Namalsk\ Survival/meta.cpp /data/dayz/testing/overrides/223350/@Namalsk\ Survival\ \(server\)
```

`2289456201` and `2289461232` were then removed from `MOD_LIST`, and the server was restarted with `CLEAN_MODS` set to `true` to remove the client mods. Afterwards `CLEAN_MODS` and `START_DAYZ_SERVER` were unset. The final config was:

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2288339650,2288336145]"
      MISSION_PATH: "@2288336145/Extras/Hardcore/hardcore.namalsk"
      TEMPLATE: "hardcore.namalsk"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Deer Isle](https://deerisle-wiki.jimdosite.com/) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,1602372402]"
      MAP_URL: https://github.com/johnmclane666/Deerisle-Stable.git
      MISSION_PATH: "/install/223350/maps/Deerisle-Stable/V5.9/empty.deerisle"
      TEMPLATE: "empty.deerisle"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Chiemsee](https://steamcommunity.com/workshop/filedetails/?id=1580589252) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,1580589252]"
      MAP_URL: https://github.com/asorrycanadian/dayzoffline.chiemsee.git
      MISSION_PATH: "/install/223350/maps/dayzoffline.chiemsee"
      TEMPLATE: "dayzoffline.chiemsee"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Rostow](https://steamcommunity.com/sharedfiles/filedetails/?id=2344585107) ❌

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-red)

Rostow and other maps by CypeR79 do not follow [Bohemia's naming convention for mission folders](https://community.bistudio.com/wiki/DayZ:Central_Economy_setup_for_custom_terrains#Mission_files:~:text=It%20is%20essential%20to%20follow%20this%20naming%20convention%20mission_name.terrain_name.) and require you to rename the mission folder beforehand. Because the project is licensed under CC BY-NC-ND 4.0, ServerZ cannot redistribute a fixed version compatible with ServerZ.

Simply renaming the mission directory, while possible, would require advising you to modify `mpmissions` inside the `INSTALL_DIRECTORY`, defeating the purpose of `INSTALL_DIRECTORY` being ephemeral and potentially breaking at any time.

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2344585107]"
      MAP_URL: https://github.com/CypeR79/DayZ-Projects.git
      MISSION_PATH: "/install/223350/maps/DayZ-Projects/Rostow/mission"
      TEMPLATE: "mission"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Esseker](https://steamcommunity.com/sharedfiles/filedetails/?id=2462896799) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2462896799]"
      MAP_URL: https://github.com/InclementDab/Esseker-Server.git
      MISSION_PATH: "/install/223350/maps/Esseker-Server/Mission Files/dayzOffline.Esseker"
      TEMPLATE: "dayzOffline.Esseker"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Takistan Plus](https://steamcommunity.com/workshop/filedetails/?id=2563233742) ❌

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-red)

See reasoning in [Rostow](#rostow-). Same issue.

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2545327648,2344585107]"
      MAP_URL: https://github.com/CypeR79/DayZ-Projects.git
      MISSION_PATH: "/install/223350/maps/DayZ-Projects/TakistanPlus/mission"
      TEMPLATE: "mission"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Banov](https://steamcommunity.com/sharedfiles/filedetails/?id=2415195639) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2415195639]"
      MAP_URL: https://github.com/KubeloLive/Banov-Central-Economy.git
      MISSION_PATH: "/install/223350/maps/Banov-Central-Economy/dayzOffline.banov"
      TEMPLATE: "dayzOffline.banov"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Swans Island](https://steamcommunity.com/sharedfiles/filedetails/?id=2517396668) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2517396668]"
      MAP_URL: https://github.com/johnmclane666/DayZ-Swansisland.git
      MISSION_PATH: "/install/223350/maps/DayZ-Swansisland/empty.swansisland"
      TEMPLATE: "empty.swansisland"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [PripyatGamma](https://steamcommunity.com/sharedfiles/filedetails/?id=3136720512) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,3136720512,2868091107]"
      MAP_URL: https://github.com/M4ketech/PripyatMissionFiles.git
      MISSION_PATH: "/install/223350/maps/PripyatMissionFiles/serverMission.Pripyat"
      TEMPLATE: "serverMission.Pripyat"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Iztek](https://steamcommunity.com/sharedfiles/filedetails/?id=2978912938) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2978912938,2978914794]"
      MAP_URL: https://github.com/ItsZarge/IztekMissionFiles.git
      MISSION_PATH: "/install/223350/maps/IztekMissionFiles/empty.Iztek"
      TEMPLATE: "empty.Iztek"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Melkart](https://steamcommunity.com/sharedfiles/filedetails/?id=2716445223) ❌

![Failed to test on 18-06-2026](https://img.shields.io/badge/Failed_to_Test_18--06--2026-red)

ServerZ has no way to obtain the server files. Packaged in an unsupported format.

### [Stuart Island](https://steamcommunity.com/sharedfiles/filedetails/?id=1936423383) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,1936423383,1951753956]"
      MISSION_PATH: "@1936423383/dayzOffline.stuartisland"
      TEMPLATE: "dayzOffline.stuartisland"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Alteria](https://steamcommunity.com/sharedfiles/filedetails/?id=3296994216) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,3296994216,3154500253]"
      MAP_URL: https://github.com/johnmclane666/DayZ-Alteria-Stable.git
      MISSION_PATH: "/install/223350/maps/DayZ-Alteria-Stable/empty.alteria"
      TEMPLATE: "empty.alteria"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Yiprit](https://steamcommunity.com/sharedfiles/filedetails/?id=2780320171) ❌

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-red)

The server files are zipped and packaged with the mod. They're apparently from an active server. The zip includes a non-empty `storage_1` directory from the previous server. ~~This directory must be whited out before the server can be started, otherwise you will receive memory corruption errors. This was done with the following commands:~~ This workaround no longer appears to prevent errors that prevent the server from starting.

```bash
mkdir -p testing/overrides/mpmissions/dayzOffline.Yiprit/storage_1
touch testing/overrides/mpmissions/dayzOffline.Yiprit/storage_1/.wh..wh.opq
```

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2780320171]"
      MAP_URL: "@2780320171/Missionfiles.zip"
      MISSION_PATH: "@2780320171/dayzOffline.Yiprit"
      TEMPLATE: "dayzOffline.Yiprit"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Nyheim](https://steamcommunity.com/sharedfiles/filedetails/?id=3336723789) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,3336723789,2330497955]"
      MAP_URL: "@3336723789/nyheim_files.zip"
      MISSION_PATH: "@3336723789/nyheim_files/empty.nyheim"
      TEMPLATE: "empty.nyheim"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Bitterroot](https://steamcommunity.com/sharedfiles/filedetails/?id=2906823750) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2906823750]"
      MISSION_PATH: "@2906823750/mpmissions/empty.Bitterroot"
      TEMPLATE: "empty.Bitterroot"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Anastara](https://steamcommunity.com/sharedfiles/filedetails/?id=2973953648&searchtext=Anastara) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2973953648,2545327648,1797720064]"
      MAP_URL: https://github.com/BATTLESQUATCH/anastara-mission.git
      MISSION_PATH: "/install/223350/maps/anastara-mission/dayzOffline.anastara"
      TEMPLATE: "dayzOffline.anastara"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Green County](https://steamcommunity.com/sharedfiles/filedetails/?id=2128098372) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2128098372]"
      MAP_URL: https://github.com/davidou2a/GreenCountyFiles.git
      MISSION_PATH: "/install/223350/maps/GreenCountyFiles/dayzOffline.GreenCounty"
      TEMPLATE: "dayzOffline.GreenCounty"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Raman](https://steamcommunity.com/sharedfiles/filedetails/?id=3401182744) ❌

![Tested on 19-06-2026](https://img.shields.io/badge/Tested-19--06--2026-red)

See reasoning in [Rostow](#rostow-). Same issue.

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,3401182744]"
      MAP_URL: https://github.com/CypeR79/DayZ-Projects.git
      MISSION_PATH: "/install/223350/maps/DayZ-Projects/Raman/newmissionfiles"
      TEMPLATE: "newmissionfiles"
      ENABLE_CFG_GAMEPLAY_FILE: true
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Deadfall](https://steamcommunity.com/sharedfiles/filedetails/?id=3050117454) ✅

![Tested on 18-06-2026](https://img.shields.io/badge/Tested-18--06--2026-green)

Deadfall recommends enabling the `cfgGameplayFile` option, so `ENABLE_CFG_GAMEPLAY_FILE` is set to `true` in the configuration. Also, initially `START_DAYZ_SERVER` is set to `false` to allow mods to download. Once downloaded, the following is run to place the recommended `CBD_PortalTeleporterSystem.json` file in the correct location. Afterwards `START_DAYZ_SERVER` is unset and the server is restarted.

```bash
mkdir -p /data/dayz/testing/overrides/223350/profiles
cd /data/dayz/testing/overrides/223350/profiles
wget https://raw.githubusercontent.com/RaytoneDeadfall/DeadfallServerFiles/refs/heads/main/extras/CBD_PortalTeleporterSystem.json

```

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,3050117454,2933015619]"
      MAP_URL: https://github.com/RaytoneDeadfall/DeadfallServerFiles.git
      MISSION_PATH: "/install/223350/maps/DeadfallServerFiles/dayz.Deadfall"
      TEMPLATE: "dayz.Deadfall"
      ENABLE_CFG_GAMEPLAY_FILE: true
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Valning](https://steamcommunity.com/sharedfiles/filedetails/?id=1880753439) ❌

![Failed to test on 19-06-2026](https://img.shields.io/badge/Failed_to_Test_19--06--2026-red)

ServerZ has no way to obtain the server files. Packaged in an unsupported format. Hosted on Discord.

### [Vela](https://steamcommunity.com/sharedfiles/filedetails/?id=2794308565) ❌

![Tested on 19-06-2026](https://img.shields.io/badge/Tested-19--06--2026-red)

Server keys are not included in the zip. Keys are hosted on Discord. You could download them and place them in a `keys` directory in the `OVERRIDES_DIRECTORY/223350` directory. However, my testing ended here.

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2794308565]"
      MAP_URL: https://github.com/c4pwn/vela/archive/refs/heads/main.zip
      MISSION_PATH: "/install/223350/maps/vela-main/empty.Vela"
      TEMPLATE: "empty.Vela"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Lux](https://steamcommunity.com/sharedfiles/filedetails/?id=3371742728) ✅

![Tested on 19-06-2026](https://img.shields.io/badge/Tested-19--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,3371742728]"
      MISSION_PATH: "@3371742728/mpmissions/dayzOffline.Lux"
      TEMPLATE: "dayzOffline.Lux"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [PNW](https://steamcommunity.com/sharedfiles/filedetails/?id=3290318225) ✅

![Tested on 19-06-2026](https://img.shields.io/badge/Tested-19--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,3290318225]"
      MAP_URL: "https://github.com/D3g0Stank/PNW-2.0-CE-and-missions.git"
      MISSION_PATH: "/install/223350/maps/PNW-2.0-CE-and-missions/Winter/empty.pnw"
      TEMPLATE: "empty.pnw"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Arsteinen](https://steamcommunity.com/sharedfiles/filedetails/?id=2982575649) ✅

![Tested on 19-06-2026](https://img.shields.io/badge/Tested-19--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,2982575649]"
      MAP_URL: "https://github.com/philmriss78/MP-Mission-Arsteinen.git"
      MISSION_PATH: "/install/223350/maps/MP-Mission-Arsteinen/empty.arsteinen"
      TEMPLATE: "empty.arsteinen"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### [Newyork](https://steamcommunity.com/sharedfiles/filedetails/?id=3054232370) ✅

![Tested on 19-06-2026](https://img.shields.io/badge/Tested-19--06--2026-green)

```yaml
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      SERVER_NAME: "ServerZ Map Testing Server"
      MOD_LIST: "[1559212036,3054232370]"
      MISSION_PATH: "@3054232370/Missionfiles/DayZOffline.Newyork"
      TEMPLATE: "DayZOffline.Newyork"
      SERVER_TIME: 2026/06/01/13/00
      CPU_COUNT: 4
    volumes:
      - "/data/dayz/testing/data:/data"
      - "/data/dayz/testing/overrides:/overrides"
      - "/data/dayz/testing/install:/install"
      - "/data/dayz/testing/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

# Tested Maps

The following maps have been tested with ServerZ. Tests include setting up the server with the `docker-compose.yml` file listed, bringing the server up, connecting to the server, and moving the player a few steps away from the spawn point \*. Given it's ubiquity, CF was an assumed requirement for all maps. Between each test the server is wiped using the `WIPE` configuration option. All maps are tested using rootless Docker.

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
- [TakistanPlus](#takistanplus-) ❌
- [Banov](#banov-) ✅
- [Swans Island](#swans-island-) ✅
- [PripyatGamma](#pripyatgamma-) ✅
- [Iztek](#iztek-) ❌
- [Melkart](#melkart-) ❌
- [Stuart Island](#stuart-island-) ✅
- [Alteria](#alteria-) ✅
- [Yiprit](#yiprit-) ✅
- [Nyheim](#nyheim-) ✅
- [Bitterroot](#bitterroot-) ✅
- [Anastara](#anastara-) ✅
- [Green County](#green-county-) ✅

### [Namalsk](https://namalsk.com/) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

Mod ids `2289456201` for Namalsk Island and `2289456202` for Namalsk Survival were added to `MOD_LIST` to retrieve the `meta.cpp` files to be used to mask the server variants being used, as per the Namalsk-Server documentation. The server was started with `START_DAYZ_SERVER` set to `false` to download the mods without starting the server.

Once downloaded the server was stopped, the following commands were ran on my host to override the `meta.cpp` files.

```bash
mkdir -p testing/overrides/@Namalsk\ Island\ \(server\)
mkdir -p testing/overrides/@Namalsk\ Survival\ \(server\)
cp testing/install/@Namalsk\ Island/meta.cpp testing/overrides/@Namalsk\ Island\ \(server\)
cp testing/install/@Namalsk\ Survival/meta.cpp testing/overrides/@Namalsk\ Survival\ \(server\)
```

`2289456201` and `2289456202` were then removed from `MOD_LIST`, and and the server was restarted with `CLEAN_MODS` was set to `true` to remove the client mods. Afterwards `CLEAN_MODS` and `START_DAYZ_SERVER` were unset. The final config was:

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    environment:
      MOD_LIST: 1559212036,2288339650,2288336145
      MISSION_PATH: "@2288336145/Extras/Hardcore/hardcore.namalsk"
      TEMPLATE: "hardcore.namalsk"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Deer Isle](https://deerisle-wiki.jimdosite.com/) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,1602372402
      MAP_URL: https://github.com/johnmclane666/Deerisle-Stable.git
      MISSION_PATH: "/install/223350/maps/Deerisle-Stable/V5.9/empty.deerisle"
      TEMPLATE: "empty.deerisle"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Chiemsee](https://steamcommunity.com/workshop/filedetails/?id=1580589252) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,1580589252
      MAP_URL: https://github.com/asorrycanadian/dayzoffline.chiemsee.git
      MISSION_PATH: "/install/223350/maps/dayzoffline.chiemsee"
      TEMPLATE: "dayzoffline.chiemsee"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Rostow](https://steamcommunity.com/sharedfiles/filedetails/?id=2344585107) ❌

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-red)

Doesn't work without renaming the mission directory. Because the project is licensed under CC BY-NC-ND 4.0, ServerZ cannot redistribute a fixed version compatible with ServerZ.

Simply renaming the mission directory, while possible, would require advising you to modify the directory within `mpmissions` within the `INSTALL_DIRECTORY`. Which defeats the purpose of the `INSTALL_DIRECTORY` being ephemeral and may break at any time.

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2344585107
      MAP_URL: https://github.com/CypeR79/DayZ-Projects.git
      MISSION_PATH: "/install/223350/maps/DayZ-Projects/Rostow/mission"
      TEMPLATE: "mission"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Esseker](https://steamcommunity.com/sharedfiles/filedetails/?id=2462896799) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2462896799
      MAP_URL: https://github.com/InclementDab/Esseker-Server.git
      MISSION_PATH: "/install/223350/maps/Esseker-Server/Mission Files/dayzOffline.Esseker"
      TEMPLATE: "dayzOffline.Esseker"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [TakistanPlus](https://steamcommunity.com/workshop/filedetails/?id=2563233742) ❌

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-red)

See reasoning in [Rostow](#rostow-). Same issue.

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2545327648,2344585107
      MAP_URL: https://github.com/CypeR79/DayZ-Projects.git
      MISSION_PATH: "/install/223350/maps/DayZ-Projects/TakistanPlus/mission"
      TEMPLATE: "mission"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Banov](https://steamcommunity.com/sharedfiles/filedetails/?id=2415195639) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2415195639
      MAP_URL: https://github.com/KubeloLive/Banov-Central-Economy.git
      MISSION_PATH: "/install/223350/maps/Banov-Central-Economy/empty.banov"
      TEMPLATE: "empty.banov"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Swans Island](https://steamcommunity.com/sharedfiles/filedetails/?id=2517396668) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2517396668
      MAP_URL: https://github.com/johnmclane666/DayZ-Swansisland.git
      MISSION_PATH: "/install/223350/maps/DayZ-Swansisland/empty.swansisland"
      TEMPLATE: "empty.swansisland"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [PripyatGamma](https://steamcommunity.com/sharedfiles/filedetails/?id=3136720512) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,3136720512,2868091107
      MAP_URL: https://github.com/M4ketech/PripyatMissionFiles.git
      MISSION_PATH: "/install/223350/maps/PripyatMissionFiles/serverMission.Pripyat"
      TEMPLATE: "serverMission.Pripyat"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Iztek](https://steamcommunity.com/sharedfiles/filedetails/?id=2978912938) ❌

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-red)

Fails to launch.

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2978912938,2978914794
      MAP_URL: https://github.com/ItsZarge/IztekMissionFiles.git
      MISSION_PATH: "/install/223350/maps/IztekMissionFiles/empty.Iztek"
      TEMPLATE: "empty.Iztek"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Melkart](https://steamcommunity.com/sharedfiles/filedetails/?id=2716445223) ❌

![Tested on 15-09-2025](https://img.shields.io/badge/Failed_to_Test_15--09--2025-red)

ServerZ has no way to obtain the server files. Packaged in a unsupported format.

### [Stuart Island](https://steamcommunity.com/sharedfiles/filedetails/?id=1936423383) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,1936423383,1951753956
      MISSION_PATH: "@1936423383/dayzOffline.stuartisland"
      TEMPLATE: "dayzOffline.stuartisland"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Alteria](https://steamcommunity.com/sharedfiles/filedetails/?id=3296994216) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,3296994216,3154500253
      MAP_URL: https://github.com/johnmclane666/DayZ-Alteria-Stable.git
      MISSION_PATH: "/install/223350/maps/DayZ-Alteria-Stable/empty.alteria"
      TEMPLATE: "empty.alteria"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Yiprit](https://steamcommunity.com/sharedfiles/filedetails/?id=2780320171) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

The server files are zipped and packaged with the mod. They're apparently from an active server. The zip includes a non-empty `storage_1` directory from the previous server. This directory must be whited out before the server can be started, otherwise you will receive memory corruption errors. This was done with the following commands:

```bash
mkdir -p testing/overrides/mpmissions/dayzOffline.Yiprit/storage_1
touch testing/overrides/mpmissions/dayzOffline.Yiprit/storage_1/.wh..wh.opq
```

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2780320171
      MAP_URL: "@2780320171/Missionfiles.zip"
      MISSION_PATH: "@2780320171/dayzOffline.Yiprit"
      TEMPLATE: "dayzOffline.Yiprit"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Nyheim](https://steamcommunity.com/sharedfiles/filedetails/?id=3336723789) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,3336723789,2330497955
      MAP_URL: "@3336723789/nyheim_files.zip"
      MISSION_PATH: "@3336723789/nyheim_files/empty.nyheim"
      TEMPLATE: "empty.nyheim"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Bitterroot](https://steamcommunity.com/sharedfiles/filedetails/?id=2906823750) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2906823750
      MISSION_PATH: "@2906823750/mpmissions/empty.Bitterroot"
      TEMPLATE: "empty.Bitterroot"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Anastara](https://steamcommunity.com/sharedfiles/filedetails/?id=2973953648&searchtext=Anastara) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2973953648,2545327648,1797720064
      MAP_URL: https://github.com/BATTLESQUATCH/anastara-mission.git
      MISSION_PATH: "/install/223350/maps/anastara-mission/dayzOffline.anastara"
      TEMPLATE: "dayzOffline.anastara"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```

### [Green County](https://steamcommunity.com/sharedfiles/filedetails/?id=2128098372) ✅

![Tested on 15-09-2025](https://img.shields.io/badge/Tested-15--09--2025-green)

```YAML
services:
  ServerZ:
    image: registry.godbleak.dev/godbleak/serverz:beta-rootless
    restart: unless-stopped
    stop_grace_period: 2m
    environment:
      MOD_LIST: 1559212036,2128098372
      MAP_URL: https://github.com/davidou2a/GreenCountyFiles.git
      MISSION_PATH: "/install/223350/maps/GreenCountyFiles/dayzOffline.GreenCounty"
      TEMPLATE: "dayzOffline.GreenCounty"
      SERVER_TIME: 2025/07/01/13/00
    ports:
    - 2302:2302/udp
    - 27016:27016/udp
    - 2304:2304/udp
    volumes:
    - ./testing/install:/install
    - ./testing/overrides:/overrides
    - ./testing/data:/data
    - ./steamconfig:/root/.steam/steam/config
```
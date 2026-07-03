# ServerZ Quick Start

Deploy a default Chernarus DayZ server.

This assumes you already have rootless Podman and `podman-compose` installed and are working as the user that will own the server files.

## 1. Create the project

```bash
mkdir -p ~/servers/_install ~/servers/_steam ~/servers/chernarus/{data,overrides}
cd ~/servers
nano compose.yml
```

Paste this:

```yaml
services:
  chernarus:
    image: registry.godbleak.dev/godbleak/serverz:rootless
    restart: unless-stopped
    stop_grace_period: 2m
    network_mode: "pasta:--ipv4-only"
    environment:
      SERVER_NAME: "My DayZ Server"
    volumes:
      - "/home/dayz/servers/chernarus/data:/data"
      - "/home/dayz/servers/chernarus/overrides:/overrides"
      - "/home/dayz/servers/_install:/install"
      - "/home/dayz/servers/_steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

See [Environment Variables](environment_variables.md) for a list of all the knobs you can tweak.

## 2. Start it and sign in to Steam

```bash
podman compose up -d
podman compose logs -f
```

Scan the Steam QR code shown in the logs. The initial DayZ download begins after authentication.

<details>
<summary>"Unusual sign in attempt" from Steam login ...</summary>
You may encounter a "unusual sign in attempt" warning from Steam when logging in.
<br />
<br />
Steam will ask:
<br />
<br />

**Where are you trying to sign in?**
<br />
Choose "Steam Client"

**Which location is closest to you**
<br />
Steam will list two locations, one physically close to you, and one near where your server is located.
<br /><br />
don't pick the location physically closest to you, choose the one physically closest to the server.
<br /><br />
Testing shows that picking the physically closest location to you results in Steam rejecting the login attempt.

**What are you trying to do?**
<br />
Choose "Other"

**You're attempting to sign in to Steam from ... If you understand why the locations would not match, you may proceed.**
<br />
Choose "Sign in to Steam"

</details>

## Add a second server

This example adds Livonia and converts the stack to use a dedicated `steam` service that centralizes Steam operations.

Each server gets its own `data` and `overrides` directories, while every service shares `_install` and `_steam`. Every server needs a unique game port and query port. The ports configured inside the container must match the host port mapping exactly.

```bash
mkdir -p ~/servers/livonia/{data,overrides}
cd ~/servers
nano compose.yml
```

Replace the compose file with:

```yaml
services:
  steam:
    image: registry.godbleak.dev/godbleak/depot-daemon:latest
    environment:
      STEAM_DOWNLOAD_DIRECTORY: "/install/223350"
      STEAM_CONTENT_SOCKET: "/root/.steam/depot.sock"
    volumes:
      - "/home/dayz/servers/_install:/install"
      - "/home/dayz/servers/_steam:/root/.steam"

  chernarus:
    image: registry.godbleak.dev/godbleak/serverz:rootless
    restart: unless-stopped
    stop_grace_period: 2m
    network_mode: "pasta:--ipv4-only"
    depends_on:
      - steam
    environment:
      SERVER_NAME: "My Chernarus Server"
      STEAM_API_ADAPTER: "remote"
      STEAM_CONTENT_SOCKET: "/root/.steam/depot.sock"
    volumes:
      - "/home/dayz/servers/chernarus/data:/data"
      - "/home/dayz/servers/chernarus/overrides:/overrides"
      - "/home/dayz/servers/_install:/install"
      - "/home/dayz/servers/_steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp

  livonia:
    image: registry.godbleak.dev/godbleak/serverz:rootless
    restart: unless-stopped
    stop_grace_period: 2m
    network_mode: "pasta:--ipv4-only"
    depends_on:
      - steam
    environment:
      SERVER_NAME: "My Livonia Server"
      TEMPLATE: "dayzOffline.enoch"
      PORT: 2303
      STEAM_QUERY_PORT: 27016
      STEAM_API_ADAPTER: "remote"
      STEAM_CONTENT_SOCKET: "/root/.steam/depot.sock"
    volumes:
      - "/home/dayz/servers/livonia/data:/data"
      - "/home/dayz/servers/livonia/overrides:/overrides"
      - "/home/dayz/servers/_install:/install"
      - "/home/dayz/servers/_steam:/root/.steam"
    ports:
      - 2303:2303/udp
      - 27016:27016/udp
```

## Apply the change

```bash
podman compose up -d
podman compose logs -f
```

## File patching

Patch DayZ files by copying them from shared `_install` into the target map's `overrides` directory. Do not edit `_install` directly: every map shares it.

```bash
mkdir -p ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db
cp ~/servers/_install/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml \
   ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db/
nano ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml
```

# ServerZ

ServerZ is a DayZ server wrapper made for running DayZ in containerized environments. It's highly configurable through the use of environment variables.

## Features

- Automatic server installation and update.
- Automatic mod installation and update.
- All of `serverDZ.cfg` is configurable through environment variables.
- Easy configuration of many (if not all) other server settings, again, through environment variables.

## Usage

> 🔵 **Note:** By default the server uses 50% of the CPU available to it. You're advised to change this by setting the environment variable `CPU_COUNT` to the actual number of CPUs you want to allocate to the server.

### Docker/Podman run

Replace `/path/to/persistent/***/directory` with the path to a directory on your host machine where you want to store persistent data. You'll want to ensure you have all 3 layer directories (see [Persistence and OverlayFS](#persistence-and-overlayfs) below) and the steam directory created beforehand.

```bash
docker run -d -P \
    -v "/path/to/persistent/data/directory:/data" \
    -v "/path/to/persistent/overrides/directory:/overrides" \
    -v "/path/to/persistent/install/directory:/install" \
    -v "/path/to/persistent/steam/directory:/root/.steam" \
    -p 2302:2302/udp \
    -p 27015:27015/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```

### Docker Compose

Replace `/path/to/persistent/***/directory` with the path to a directory on your host machine where you want to store persistent data.

```yaml
services:
  serverz:
    image: registry.godbleak.dev/godbleak/serverz:latest
    restart: unless-stopped
    environment:
      MOTD: '["DayZ Server in a Box"]' # Example of setting a serverDZ.cfg variable
    volumes:
      - "/path/to/persistent/data/directory:/data"
      - "/path/to/persistent/overrides/directory:/overrides"
      - "/path/to/persistent/install/directory:/install"
      - "/path/to/persistent/steam/directory:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

### Rootless

ServerZ treats rootless deployment as a first-class citizen, and provides the `:rootless` for it. The rootless image is designed to be used with and tested against [Podman](https://podman.io/). YMMV with rootless Docker.

```bash
podman run -d -P \
    -v "/path/to/persistent/data/directory:/data" \
    -v "/path/to/persistent/overrides/directory:/overrides" \
    -v "/path/to/persistent/install/directory:/install" \
    -v "/path/to/persistent/steam/directory:/root/.steam" \
    -p 2302:2302/udp \
    -p 27015:27015/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:rootless
```

### Development

1. Clone the repository.

```bash
git clone gitlab.godbleak.dev/godbleak/serverz.git
```

2. Change into the directory.

```bash
cd serverz
```

3. Install the dependencies.

```bash
bun install
```

4. Develop.
5. Run in development mode.

```bash
bun run dev
```

6. Run in production mode.

```bash
bun start
```

## Logging into Steam
Unless you're using the DayZ Experimental server build without Workshop content, you'll need to authenticate with Steam to download the server and workshop items. Previously, this meant providing your Steam credentials through environment variables. However, this is no longer the only option, nor is it the recommended option. 

### QR Login (Recommended)
By default, ServerZ now uses QR Code login. On startup you'll see something like this printed in the container logs:

```
[2025-12-12T00:00:00.000Z] [ServerZ] [INFO] Mounted overlayFS at /dayz/223350
[2025-12-12T00:00:00.000Z] [ServerZ] [INFO] QR code challenge received. Please scan the following QR code with your Steam mobile app to log in:
[2025-12-12T00:00:00.000Z] [ServerZ] [INFO] QR Challenge URL: https://s.team/q/1/12345678912345678912
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█ ▄▄▄▄▄ █ ▄▄ ████▄▄▀█ █ ▄▄▄▄▄ █
█ █   █ ██▄█▀▀ █   ▄█ █ █   █ █
█ █▄▄▄█ █ ▀▀▄ ▄██ ▄▀█▄█ █▄▄▄█ █
█▄▄▄▄▄▄▄█ ▀▄█▄█ ▀ █ ▀▄█▄▄▄▄▄▄▄█
█   ██ ▄█ ▄█▄ █  ██  █▄  ▄██  █
█▀▄ ▀█▀▄▄▀▄ ▀ █▄  ██▄█ ▄▀▄ ▄█▄█
██▀▀ ▀█▄ ▄▄ ██ ▄ ██  ██  ███▀ █
█▄▄█ █▀▄█▀█ ▄█▀█▄▀█▀ ▀▀█ ▄███▄█
█▄  ▄▀ ▄▄▄▀▀▄ ▄█ █▀ ▀▄▄ ▀██▀▀ █
█▄▄▄▄█▄▄▀▀▄▀▀ ▄ ▄ ▄▄▄█▀▀ ▀▄██▄█
█▄▄▄▄▄▄▄█▀█▄██   █▀   ▄▄▄  ▀▄▀█
█ ▄▄▄▄▄ █▀▀█▄█▀█ █▄ █ █▄█ ██▀ █
█ █   █ ███▀▄ ▄█ ██    ▄▄  ▀█ █
█ █▄▄▄█ █ ▄▀▀ ▄  ▄▄ █▀██  ▀█▄▄█
█▄▄▄▄▄▄▄█▄▄▄██▄▄▄██▄▄▄█▄▄▄███▄█
```
Open the Steam app ([Android](https://play.google.com/store/apps/details?id=com.valvesoftware.android.steam.community)|[iOS](https://apps.apple.com/app/steam-mobile/id495369748)) and [scan](https://help.steampowered.com/en/faqs/view/7EFD-3CAE-64D3-1C31#qrlogin) the QR shown in your logs.

### Username & Password (Strongly discouraged)
Should QR Login not work for you, ServerZ still supports logging in by passing your credentials through environment variables, for example:
```yaml
services:
  serverz:
    image: registry.godbleak.dev/godbleak/serverz:latest
    restart: unless-stopped
    environment:
      STEAM_USERNAME: "Survivor" # your steam username here
      STEAM_PASSWORD: "!nf3ct3d" # your steam password here
    volumes:
      - "/path/to/persistent/data/directory:/data"
      - "/path/to/persistent/overrides/directory:/overrides"
      - "/path/to/persistent/install/directory:/install"
      - "/path/to/persistent/steam/directory:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```
### Anonymous
If you're using the experimental server, you do not need to login. If you have saved credentials, and wish to login anonymously without losing those saved credentials, set `STEAM_USERNAME` to "anonymous". 

### Persisting credentials
However you logged in, to ensure you don't need to do so again every time the container is recreated or if you want to share the saved credentials between servers, bind mount `/root/.steam` to somewhere on your host, like: 
```bash
docker run -d \
    -v "/path/to/persistent/data/directory:/data" \
    -v "/path/to/persistent/overrides/directory:/overrides" \
    -v "/path/to/persistent/install/directory:/install" \
    -v "/path/to/persistent/steam/directory:/root/.steam" \
    -p 2302:2302/udp \
    -p 27015:27015/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```
> 🔵 **Note:** If you used Username & Password to login, you should remove `STEAM_PASSWORD` from the compose file or docker run command. Subsequent containers/restarts should not need `STEAM_PASSWORD`; saved credentials will be reused from `/root/.steam`. You may leave `STEAM_USERNAME` set to make the intended account explicit.

## Environment Variables

See [Environment Variables](doc/environment_variables.md).

## Changing the Default Ports

By default, the server uses the following ports:

- 2302/udp (Game Port)
- 27015/udp (Steam Query Port)

To change these ports, it's not enough to modify the port mapping in your docker configuration. You'll also need to set the `PORT` and `STEAM_QUERY_PORT` environment variables to the new port numbers.

## Installing Mods

To install mods, set the `MOD_LIST` environment variable to a comma separated list of workshop item IDs. For example, to install CF and VPPAdminTools, you'd use the following docker run command:

```bash
docker run -d -P \
    -v "/path/to/persistent/data/directory:/data" \
    -v "/path/to/persistent/overrides/directory:/overrides" \
    -v "/path/to/persistent/install/directory:/install" \
    -v "/path/to/persistent/steam/directory:/root/.steam" \
    -e "MOD_LIST='[1559212036,1828439124]'" \
    -p 2302:2302/udp \
    -p 27015:27015/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```

> 🔵 **Note:** In respect to mods, there's only so much that can be done with environment variables. You will likely still need to do some manual configuration (like mod-specific configuration, merging types, etc).
>
> The server will do the following for you:
>
> - Download the mods
> - Create a symlink from its workshop folder to its `@mod` folder in the server root
> - Link all the mod's keys to the server's keys folder
> - Add the mods to the server's launch parameters
>
> Anything beyond this will need to be done manually.

## Using Maps

By default the server will load Chernarus. However, if you'd instead like to use...

### DLC (Sakhal)

To enable a DLC map, you typically only need to set the TEMPLATE environment variable. For example, to run a server on Sakhal, you could use the following docker run command:

```bash
docker run -d -P \
    -v "/path/to/persistent/data/directory:/data" \
    -v "/path/to/persistent/overrides/directory:/overrides" \
    -v "/path/to/persistent/install/directory:/install" \
    -v "/path/to/persistent/steam/directory:/root/.steam" \
    -e "TEMPLATE=dayzOffline.sakhal" \
    -p 2302:2302/udp \
    -p 27015:27015/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```

### Livonia

You only need to set the `TEMPLATE` environment variable. For example, you could use the following docker run command:

```bash
docker run -d -P \
    -v "/path/to/persistent/data/directory:/data" \
    -v "/path/to/persistent/overrides/directory:/overrides" \
    -v "/path/to/persistent/install/directory:/install" \
    -v "/path/to/persistent/steam/directory:/root/.steam" \
    -e "TEMPLATE=dayzOffline.enoch" \
    -p 2302:2302/udp \
    -p 27015:27015/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```

### Custom Maps

You will need to tell the server how to download it. Currently the server can obtain it one of three ways:

- From the workshop
- From a git repository
- From a zip file

---

#### Download from Workshop

> **🟠 Warning:** This method treats the map as a mod, and will be updated as such. This means that `UPDATE_MAP` has no effect on maps downloaded this way, and will be updated with the rest of the mods (On server start, unless `SKIP_MODS` is set to `true`).

To download a map from the workshop, you can simply add the map's workshop ID to the `MOD_LIST` environment variable.

Maps downloaded from the workshop are downloaded to the same location as mods (Usually `/install/223350/steamapps/workshop/content/221100`).

#### Download from Git or Zip

To download a map from a git repository or a zip file, you can set the `MAP_URL` environment variable to the URL of the repository (git repo URL should end in `.git`) or zip file.

Maps downloaded this way are downloaded to the `maps` directory in the server root (Usually `/install/223350/maps`).

---

Once you've set the appropriate environment variable to download the map, you'll need to set the `MISSION_PATH` environment variable to tell the server where the mission folder is located. The server will symlink the mission folder into the `mpmission` directory.

Finally, you'll need to set the `TEMPLATE` environment variable to the name of the map's mission folder.

For example, to run a server on the [Namalsk](https://www.nightstalkers.cz/namalsk-sa/) map, downloaded from the workshop (with the "Namalsk Survival (server)" item) you could use the following docker-compose file:

```yaml
services:
  serverz:
    image: registry.godbleak.dev/godbleak/serverz:latest
    restart: unless-stopped
    volumes:
      - "/path/to/persistent/data/directory:/data"
      - "/path/to/persistent/overrides/directory:/overrides"
      - "/path/to/persistent/install/directory:/install"
      - "/path/to/persistent/steam/directory:/root/.steam"
    environment:
      MOD_LIST: "[1559212036,2288339650,2288336145]" # CF, Namalsk Island (server), Namalsk Survival (server)
      MISSION_PATH: /dayz/223350/steamapps/workshop/content/221100/2288336145/Extras/Regular/regular.namalsk
      TEMPLATE: regular.namalsk
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

To run a server on the [Banov](https://steamcommunity.com/sharedfiles/filedetails/?id=2415195639) map, downloaded from a git repository, you could use the following docker-compose file:

```yaml
services:
  serverz:
    image: registry.godbleak.dev/godbleak/serverz:latest
    restart: unless-stopped
    volumes:
      - "/path/to/persistent/data/directory:/data"
      - "/path/to/persistent/overrides/directory:/overrides"
      - "/path/to/persistent/install/directory:/install"
      - "/path/to/persistent/steam/directory:/root/.steam"
    environment:
      MOD_LIST: "[1559212036,2415195639]" # CF, Banov
      MAP_URL: https://github.com/KubeloLive/Banov.git
      MISSION_PATH: /dayz/223350/maps/Banov/empty.banov
      TEMPLATE: empty.banov
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

## Experimental

To run the experimental DayZ Server, change the `APP_ID` environment variable to it's app ID (1042420).

### Mods

To install mods when running the experimental server, set the `MOD_APP_ID` environment variable to the app ID of the experimental client (1024020). This changes the steamCMD command to download the mods from the workshop associated with the experimental client.

## Persistence and OverlayFS

As of version 2.0.0, ServerZ now utilizes OverlayFS, for a few reasons:

- To make sure **your customizations to the base game aren't overwritten by Steam** when updating or validating the server, maps, or mods.
- To **allow one installation of DayZ to serve multiple instances of ServerZ.** With this, one ServerZ instance has a base installation size of ~3GB, you can add another, 5, or 100 or more instances of ServerZ, and still only be using ~3GB of disk space for base installs, total.
- To facilitate **thinner backups.** Because all server writes are captured to `DATA_DIRECTORY`, you can backup _server state_ (not configuration) by backing up the `DATA_DIRECTORY` and it will only contain the delta between your server's state and the base game state -- your backups don't need to contain the entire DayZ Server installation.

### OverlayFS

<details>
  <summary>For the uninitiated...</summary>

OverlayFS is an implementation of a [union mount](https://en.wikipedia.org/wiki/Union_mount). A union mount allows you to layer multiple directories on top of each other, and present them as a single directory. You can visualize this much like [cel animation](https://en.wikipedia.org/wiki/Traditional_animation#Cels):

  <div align="center">
    <figure>
      <img src="https://upload.wikimedia.org/wikipedia/commons/b/b3/Animation_cells.png" alt="Diagram of the cel animation process">
      <figcaption>By <a href="https://en.wikipedia.org/wiki/User:Garrett_Albright" class="extiw" title="en:User:Garrett Albright">Garrett Albright</a> at the <a href="https://en.wikipedia.org/wiki/" class="extiw" title="w:">English-language Wikipedia</a>, <a href="http://creativecommons.org/licenses/by-sa/3.0/" title="Creative Commons Attribution-Share Alike 3.0">CC BY-SA 3.0</a>, <a href="https://commons.wikimedia.org/w/index.php?curid=15966073">Link</a></figcaption>
    </figure>
  </div>

Where the base game is the background, your customizations are the orange character cel in the diagram, while the server writes to the yellow character cel. The resulting "merged view" (or "merged directory") is the composite image. From DayZServer's perspective (same as the camera's), this appears as a regular single directory.

</details>

#### Layer Overview

Merged Directory:

```
/dayz/223350 (SERVER_DIRECTORY) <- Merged view of the upper and lower directories. This is the directory that DayZServer is presented as its working directory. You should not mount this directory.
```

Upper Directory:

```
/data/223350 (DATA_DIRECTORY) <- Where DayZServer writes get captured to.
```

Lower Directories:

```
/tmp/serverz/dayz/223350 (GENERATED_CONFIG_DIRECTORY) <- ServerZ managed, is where configuration files generated from environment variables are stored. Should not be mounted.
/overrides/223350 (OVERRIDES_DIRECTORY) <- Your local overrides of the base install. See Overrides below.
/install/223350 (INSTALL_DIRECTORY) <- Steam managed. May be shared across multiple ServerZ instances.
```

### Overrides

When you need to edit server files, you should not edit files in `INSTALL_DIRECTORY`, instead you should store your modified files in `OVERRIDES_DIRECTORY`.

### Manual Editing

For example sake, let's assume you bind mount `INSTALL_DIRECTORY` to `./install` on your host, and `OVERRIDES_DIRECTORY` to `./overrides` on your host.

When you edit a file in `./overrides`, it will take precedence over the same file in `./install`, in the container. You only need to mirror the path of files you want to override - not the entire game directory. For example, to customize the types.xml in your
mission:

Base game structure:

```
./install
└── 223350
    ├── DayZServer
    ├── mpmissions/
    │   └── dayzOffline.chernarusplus/
    │       ├── init.c
    │       ├── db/
    │       │   ├── types.xml      ← file you want to edit
    │       │   ├── events.xml
    │       │   └── messages.xml
    │       └── ...
    └── ...
```

Your overrides directory only needs the path to the file:

```
./overrides
└── 223350
    └── mpmissions/
        └── dayzOffline.chernarusplus/
            └── db/
                └── types.xml      ← your customized version
```

**To modify an existing file**, copy it from `./install` first:

```bash
mkdir -p ./overrides/223350/mpmissions/dayzOffline.chernarusplus/db
cp ./install/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml \
   ./overrides/223350/mpmissions/dayzOffline.chernarusplus/db/
nano ./overrides/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml
```

**To add a new file** that doesn't exist in the base game, just create it:

```bash
mkdir -p ./overrides/223350/mpmissions/dayzOffline.chernarusplus/db
nano ./overrides/223350/mpmissions/dayzOffline.chernarusplus/db/custom.xml
```

The server will see the merged result: your `types.xml` from overrides,
and everything else from the base install. No need to copy files you
aren't changing.

### Easier: Web-Based File Editor

**Before editing:** Stop your ServerZ container(s) to avoid inconsistent state.

If recreating directory structures by hand is tedious, you can run a web-based file browser that handles the overlay mechanics for you - you see the
complete merged file tree and any edits automatically land in `./overrides`:

```bash
podman run -d \
    --name serverz-editor \
    -u "0:0" \
    -e FB_PORT=8080 \
    -v "$PWD/install:/srv:O,upperdir=$PWD/overrides,workdir=$PWD/.filebrowser-work" \
    -v "$PWD/data/223350/profiles:/srv/223350/profiles:Z" \
    -v filebrowser_database:/database \
    -p 8080:8080 \
    filebrowser/filebrowser
```

Visit `http://localhost:8080` in your browser, use "admin" as the username, and the password printed in the container's logs.

Refer to [filebrowser/filebrowser](https://github.com/filebrowser/filebrowser)
for usage and configuration.

## Issues

If you encounter any issues, please report them [here](https://gitlab.godbleak.dev/godbleak/serverz/issues). (You can use GitHub SSO to sign in)

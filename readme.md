# ServerZ
> [!NOTE]
> This is a mirror of [ServerZ on my GitLab instance](https://gitlab.godbleak.dev/godbleak/serverz), and is not the primary repository. 

ServerZ is a DayZ server wrapper made for running DayZ in containerized environments. It's highly configurable through the use of environment variables.

## Features
- Automatic server installation and update.
- Automatic mod installation and update.
- Nearly all of `serverDZ.cfg` is configurable through environment variables.
- Easy configuration of many (if not all) other server settings, again, through environment variables.

## Usage
> 🔵 **Note:** By default the server uses 50% of the CPU available to it. You're advised to change this by setting the environment vaiable `CPU_COUNT` to the actual number of CPUs you want to allocate to the server.

### Docker
Replace `/path/to/persistent/***/directory` with the path to a directory on your host machine where you want to store persistent data. Replace `your_steam_username`, `your_steam_password`, and `your_steam_guard_code` with your Steam credentials and Steam Guard code.

```bash
docker run -d -P \
    -v "/path/to/persistent/dayz/directory:/dayz" \
    -v "/path/to/persistent/profiles/directory:/profiles" \
    -e "STEAM_USERNAME=your_steam_username" \
    -e "STEAM_PASSWORD=your_steam_password" \
    -e "STEAM_GUARD_CODE=your_steam_guard_code" \
    -p 2302:2302/udp \
    -p 2305:2305/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```

### Docker Compose
Replace `/path/to/persistent/***/directory` with the path to a directory on your host machine where you want to store persistent data. Replace `your_steam_username`, `your_steam_password`, and `your_steam_guard_code` with your Steam credentials and Steam Guard code. 

```yaml
version: "3.7"
services:
  serverz:
    image: registry.godbleak.dev/godbleak/serverz:latest
    restart: unless-stopped
    volumes:
      - "/path/to/persistent/dayz/directory:/dayz"
      - "/path/to/persistent/profiles/directory:/profiles"
    environment:
      STEAM_USERNAME: your_steam_username
      STEAM_PASSWORD: your_steam_password
      STEAM_GUARD_CODE: your_steam_guard_code
      MOTD: DayZ Server in a Box # Example of setting a serverDZ.cfg variable
    ports:
      - 2302:2302/udp
      - 2305:2305/udp
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
npm install
```
4. Develop.
5. Run in development mode.
```bash
npm run dev
```
6. Build for production.
```bash
npm run build
```
7. Run in production mode.
```bash
npm start
```

## Environment Variables
See [Environment Variables](doc/environment_variables.md).

## Changing the Default Ports
By default, the server uses the following ports:
- 2302/udp (Game Port)
- 2305/udp (Steam Query Port)

To change these ports, it's not enough to modify the port mapping in your docker configuration. You'll also need to set the `PORT` and `STEAM_QUERY_PORT` environment variables to the new port numbers.

## Installing Mods
To install mods, set the `MOD_LIST` environment variable to a comma separated list of workshop item IDs. For example, to install CF and VPPAdminTools, you'd use the following docker run command:
```bash
docker run -d -P \
    -v "/path/to/persistent/dayz/directory:/dayz" \
    -v "/path/to/persistent/profiles/directory:/profiles" \
    -e "STEAM_USERNAME=your_steam_username" \
    -e "STEAM_PASSWORD=your_steam_password" \
    -e "STEAM_GUARD_CODE=your_steam_guard_code" \
    -e "MOD_LIST=1559212036,1828439124" \
    -p 2302:2302/udp \
    -p 2305:2305/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```
> 🔵 **Note:** In respect to mods, there's only so much that can be done with environment variables. You will likely still need to do some manual configuration (like mod-specific configuration, merging types, etc).
>
> The server will do the following for you:
> - Download the mods
> - Create a symlink from its workshop folder to its `@mod` folder in the server root
> - Link all the mod's keys to the server's keys folder
> - Add the mods to the server's launch parameters
>
>Anything beyond this will need to be done manually.

## Using Maps

### DLC (Livonia)
To enable a DLC map, you typically only need to set the `TEMPLATE` environment variable. For example, to run a server on Livonia (Currently the only DLC map), you could use the following docker run command:
```bash
docker run -d -P \
    -v "/path/to/persistent/dayz/directory:/dayz" \
    -v "/path/to/persistent/profiles/directory:/profiles" \
    -e "STEAM_USERNAME=your_steam_username" \
    -e "STEAM_PASSWORD=your_steam_password" \
    -e "STEAM_GUARD_CODE=your_steam_guard_code" \
    -e "TEMPLATE=dayzOffline.enoch" \
    -p 2302:2302/udp \
    -p 2305:2305/udp \
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```

### Custom Maps
For non-official maps, you will need to tell the server how to download it. Currently the server can obtain it one of three ways:
- From the workshop
- From a git repository
- From a zip file

---

#### Download from Workshop
To download a map from the workshop, you can simply add the map's workshop ID to the `MOD_LIST` environment variable.

Maps downloaded from the workshop are downloaded to the same location as mods (Usually `/dayz/steamapps/workshop/content/221100`).

> **🟠 Warning:** This method treats the map as a mod, and will be updated as such. This means that `UPDATE_MAP` has no effect on maps downloaded this way, and will be updated with the rest of the mods (On server start, unless `SKIP_MODS` is set to `true`). 
> 
>**If** the map stores persistent data within its mod folder*:
> - and said data is stored solely within the mission directory, use `COPY_MISSION` to have the server copy the mission folder to the `mpmission` directory, rather than symlink it. 
> - otherwise, if data is stored anywhere else in the mod folder, it may be lost on server restart.
>
>_\* Not enough testing/research has been conducted to determine if this is actually applicable to any map._

#### Download from Git or Zip
To download a map from a git repository or a zip file, you can set the `MAP_URL` environment variable to the URL of the repository (git repo URL should end in `.git`) or zip file.

Maps downloaded this way are downloaded to the `maps` directory in the server root (Usually `/dayz/maps`).

---

Once you've set the appropriate environment variable to download the map, you'll need to set the `MISSION_PATH` environment variable to tell the server where the mission folder is located. The server will symlink (or copy, if `COPY_MISSION` is `true`) the mission folder into the `mpmission` directory.

Finally, you'll need to set the `TEMPLATE` environment variable to the name of the map's mission folder.

For example, to run a server on the [Namalsk](https://www.nightstalkers.cz/namalsk-sa/) map, downloaded from the workshop (with the "Namalsk Survival (server)" item) you could use the following docker-compose file:

```yaml
version: "3.7"
services:
  serverz:
    image: registry.godbleak.dev/godbleak/serverz:latest
    restart: unless-stopped
    volumes:
      - "/path/to/persistent/dayz/directory:/dayz"
      - "/path/to/persistent/profiles/directory:/profiles"
    environment:
      STEAM_USERNAME: your_steam_username
      STEAM_PASSWORD: your_steam_password
      STEAM_GUARD_CODE: your_steam_guard_code
      MOD_LIST: 1559212036,2288339650,2288336145 # CF, Namalsk Island (server), Namalsk Survival (server)
      MISSION_PATH: /dayz/steamapps/workshop/content/221100/2288336145/Extras/Regular/regular.namalsk
      COPY_MISSION: true
      TEMPLATE: regular.namalsk
    ports:
      - 2302:2302/udp
      - 2305:2305/udp
```

To run a server on the [Banov](https://steamcommunity.com/sharedfiles/filedetails/?id=2415195639) map, downloaded from a git repository, you could use the following docker-compose file:

```yaml
version: "3.7"
services:
  serverz:
    image: registry.godbleak.dev/godbleak/serverz:latest
    restart: unless-stopped
    volumes:
      - "/path/to/persistent/dayz/directory:/dayz"
      - "/path/to/persistent/profiles/directory:/profiles"
    environment:
      STEAM_USERNAME: your_steam_username
      STEAM_PASSWORD: your_steam_password
      STEAM_GUARD_CODE: your_steam_guard_code
      MOD_LIST: 1559212036,2415195639 # CF, Banov
      MAP_URL: https://github.com/KubeloLive/Banov.git
      MISSION_PATH: /dayz/maps/Banov/empty.banov
      TEMPLATE: empty.banov
    ports:
      - 2302:2302/udp
      - 2305:2305/udp
```

## Experimental
To run the experimental DayZ Server, change the `APP_ID` environment variable to it's app ID (1042420).

### Mods
To install mods when running the experimental server, set the `MOD_APP_ID` environment variable to the app ID of the experimental client (1024020). This changes the steamCMD command to download the mods from the workshop associated with the experimental client.

## Issues
If you encounter any issues, please report them [here](https://gitlab.godbleak.dev/godbleak/serverz/issues). (You can use GitHub SSO to sign in)
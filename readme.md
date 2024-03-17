# ServerZ

ServerZ is a DayZ server made for running in containerized environments. It's highly configurable through the use of environment variables.

## Features
- Automatic server installation and update.
- Automatic mod installation and update.
- Nearly all of `serverDZ.cfg` is configurable through environment variables.
- Easy configuration of many (if not all) other server settings, again, through environment variables.

## Usage
### Docker
Replace `/path/to/persistent/***/directory` with the path to a directory on your host machine where you want to store persistent data. Replace `your_steam_username`, `your_steam_password`, and `your_steam_guard_code` with your Steam credentials and Steam Guard code.

```bash
docker run -d -P \
    -v "/path/to/persistent/dayz/directory:/dayz" \
    -v "/path/to/persistent/profiles/directory:/profiles" \
    -e "STEAM_USERNAME=your_steam_username" \
    -e "STEAM_PASSWORD=your_steam_password" \
    -e "STEAM_GUARD_CODE=your_steam_guard_code" \
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
    container_name: serverz
    volumes:
      - "/path/to/persistent/dayz/directory:/dayz"
      - "/path/to/persistent/profiles/directory:/profiles"
    environment:
      - STEAM_USERNAME=your_steam_username
      - STEAM_PASSWORD=your_steam_password
      - STEAM_GUARD_CODE=your_steam_guard_code
      - MOTD=DayZ Server in a Box # Example of setting a serverDZ.cfg variable
    restart: unless-stopped
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
<!-- refer to doc at `doc/environment_variables.md -->
See [Environment Variables](doc/environment_variables.md).

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
    --restart unless-stopped \
    registry.godbleak.dev/godbleak/serverz:latest
```
## Experimental
To run the experimental DayZ Server, change the `APP_ID` environment variable to it's app ID (1042420).

### Mods
To install mods when running the experimental server, set the `MOD_APP_ID` environment variable to the app ID of the experimental client (1024020). This changes the steamCMD command to download the mods from the workshop associated with the experimental client.

## Issues
If you encounter any issues, please report them [here](https://gitlab.godbleak.dev/godbleak/serverz/issues). (You can use GitHub SSO to sign in)
# Self-Hosting a DayZ Server with Rootless Podman

This tutorial walks through setting up one or more DayZ servers on a Debian-based Linux box using rootless Podman, then making sure they survive reboots and stay updated.

## Prerequisites

- A Steam account that owns DayZ
- Access to a Debian-based Linux server (Ubuntu shown here), via SSH
- A user account with sudo privileges

If you don't have a Linux server, you can rent one — see [SyntaxScribe/Awesome-Server-VPS-Hosting-Providers](https://github.com/SyntaxScribe/Awesome-Server-VPS-Hosting-Providers) for a list of providers. Look under "Bare Metal (Dedicated)", "VPS (Unmanaged)", or "Game & DDoS-Focused".

**Minimum specs per DayZ server:**

- 2 CPU cores at 2.5GHz
- 6GB RAM
- 5GB disk space (10GB+ recommended)
- SSD-backed storage is strongly recommended

## Server Setup

### 1. Install Podman and other dependencies

[Podman](https://podman.io/) lets us run the DayZ server in containers, which, among other advantages, gives us an ergonomic way to manage the server and, should you choose to run multiple servers, organize them. Podman is a rootless-first alternative to [Docker](https://www.docker.com/).

```bash
sudo apt update
sudo apt install -y podman pipx nano
```

### 2. Create and use a dedicated user

It's best practice to run game servers as a dedicated, rootless user. This compartmentalizes the risk of a compromised container (however unlikely) to a single, unprivileged user. Create a user with the following command:

```bash
sudo adduser dayz
```

And follow the prompts to set a password, optionally, give the user a name, press enter to skip the rest of the questions, confirm the information is correct by pressing "Y". The whole process will look something like this:

```
ubuntu@test:~$ sudo adduser dayz
info: Adding user `dayz' ...
info: Selecting UID/GID from range 1000 to 59999 ...
info: Adding new group `dayz' (1001) ...
info: Adding new user `dayz' (1001) with group `dayz (1001)' ...
info: Creating home directory `/home/dayz' ...
info: Copying files from `/etc/skel' ...
New password:
Retype new password:
passwd: password updated successfully
Changing the user information for dayz
Enter the new value, or press ENTER for the default
        Full Name []: DayZ
        Room Number []:
        Work Phone []:
        Home Phone []:
        Other []:
Is the information correct? [Y/n]
info: Adding new user `dayz' to supplemental / extra groups `users' ...
info: Adding user `dayz' to group `users' ...
```

By default, a regular user's systemd services stop when they log out. Enable "lingering" so `dayz`'s services keep running after you disconnect and across reboots:

```bash
sudo loginctl enable-linger dayz
```

Switch to the new user:

```bash
su - dayz
```

Set up `pipx` so user-installed Python tools (like `podman-compose`) are on the `PATH`:

```bash
pipx ensurepath
source ~/.bashrc
```

### 3. Install `podman-compose`:

[podman-compose](https://github.com/containers/podman-compose) gives us a way to use compose files to run our podman containers.

Further reading on the topic:

- [Better Stack's Podman Compose Tutorial for Beginners](https://betterstack.com/community/guides/scaling-docker/podman-compose/)
- [Docker's Compose Documentation](https://docs.docker.com/compose/) Yes, this is for Docker Compose; however, podman-compose lacks documentation as complete as Docker Compose, and many of the concepts transfer because both implement the [Compose Specification](https://www.compose-spec.io/). Individual features and behaviors may differ slightly.

#### 1. Install `podman-compose`:

```bash
pipx install podman-compose
```

#### 2. Add the global systemd unit templates

This will let us generate systemd units later on. First we need the `dayz` user's path to the `podman-compose` binary we just installed. Run the following command to find it:

```bash
which podman-compose
```

This will output something like `/home/dayz/.local/bin/podman-compose`.

Now we need to generate the global systemd unit templates as a sudoer using the `podman-compose` binary of the `dayz` user. First exit to get back to your sudo-capable user:

```bash
exit
```

Then run the following command to generate the global systemd unit file templates:

```bash
sudo /home/dayz/.local/bin/podman-compose systemd --action create-unit
```

Then return to the `dayz` user:

```bash
su - dayz
```

## Set up a single server

The following is the meat of setting up a single DayZ server. If you're deploying multiple servers, you may wish to skip directly to [Set up multiple servers](#set-up-multiple-servers). However, if one server is all you're starting with today, continue with this section. In the future, if you wish to add more servers, [Migrate to a multi-container setup](#migrate-to-a-multi-container-setup) will walk you through transforming what you did here to a state where you can proceed to the [Set up multiple servers](#set-up-multiple-servers) section (ideally) without issue.

### 1. Create the directory structure:

```bash
mkdir -p ~/servers/chernarus && cd ~/servers/chernarus
mkdir install overrides data steam
```

This creates a directory structure that looks like this:

```
~/servers/chernarus
├── data
├── install
├── overrides
└── steam
```

The `chernarus` part of `~/servers/chernarus` is purely organizational. It reflects a common setup where servers are organized by map. If that's not your mental model, you could use a different, more meaningful-to-you, name.

<details>
<summary>If you already created that directory and now want to rename it...</summary>
 
 you can do so with the following command:

```bash
mv ~/servers/chernarus ~/servers/chosen-name-here
```

</details>
<br/>

Just remember, if you renamed it, to use that name instead of `chernarus` where this guide references `~/servers/chernarus` or `/home/dayz/servers/chernarus`

### 2. Create the compose file:

Use [nano](https://linuxize.com/post/how-to-use-nano-text-editor/) to create and edit the file:

```bash
nano compose.yml
```

Paste the following compose configuration into the file, then save and exit:

```yaml
services:
  chernarus:
    image: registry.godbleak.dev/godbleak/serverz:rootless
    restart: unless-stopped
    stop_grace_period: 2m
    network_mode: "pasta:--ipv4-only"
    environment:
      MOTD: '["DayZ in a Box"]'
    volumes:
      - "/home/dayz/servers/chernarus/data:/data"
      - "/home/dayz/servers/chernarus/overrides:/overrides"
      - "/home/dayz/servers/chernarus/install:/install"
      - "/home/dayz/servers/chernarus/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

<details>
<summary>Volumes explained</summary>

- `install` is Steam-managed — this is where the base DayZ server, maps, and mods get downloaded to, and it can safely be shared across multiple ServerZ instances since it's the same ~3GB base install either way,
- `overrides` holds your customizations (like a hand-edited `types.xml`) layered on top of `install`, mirroring only the specific file paths you want to change — you don't need to recreate the whole game directory here,
- `data` is where the server's actual writes land (the "upper" overlay layer) — this is your real persistent state and the thing you actually need to back up, and
- `steam` (mounted to `/root/.steam`) persists your Steam login, so you don't have to re-authenticate (via QR code, by default) every time the container restarts.

The first three of these are combined via OverlayFS into a single merged view the DayZ server itself sees as one directory: `install` and `overrides` are read-only lower layers (with `overrides` taking precedence over `install` for any file that exists in both), and `data` is the writable upper layer that captures everything the running server changes. `steam` sits outside this overlay entirely — it's just a regular bind mount for your cached Steam login. This is also why backups can stay thin — `data` only ever contains the delta from the base install, not a full copy of the game.

</details>

#### `podman-compose` commands

```bash
podman-compose up -d # starts the server, `-d` detaches so that the server doesn't shutdown when you exit the terminal
podman-compose down # stops the server
podman-compose restart # restarts the server
podman-compose logs -f # follow the logs
```

Usually `podman-compose` commands are ran from the directory containing the `compose.yml` file you're targeting. For this guide, that's `/home/dayz/servers/chernarus` or `~/servers/chernarus`. Check with:

```bash
pwd
```

if doesn't print the correct directory, change to that directory first:

```bash
cd ~/servers/chernarus
```

#### Applying `compose.yml` changes

After editing the compose file, you need to re-create the container for the changes to take effect. You can do this by re-running

```bash
podman-compose up -d
```

### 3. Start the server

```bash
podman-compose up -d # starts the server
podman-compose logs -f # follow the logs
```

Give it a few minutes on first start. By default ServerZ authenticates with Steam via QR code: watch the logs, and you'll see a QR code printed there. Scan it with the Steam mobile app to log in, after which the server will proceed to download and start. Ctrl+C exits the log tail without stopping the container.

Your Steam login is then cached in the `steam` volume, so you won't need to re-scan on every restart — only if that volume is wiped or you're starting a brand-new server.

<details>
<summary>"Unusual sign in attempt" from Steam login ...</summary>
Sometimes you may encounter a "unusual sign in attempt" warning from Steam when logging in, especially if you're using a VPS that's far from your physical location. This is a security check that Valve implements to try to prevent your account from being compromised, since logging into Steam on a device that's potentially hundreds of kilometers away from where you scanned that QR code isn't typical behavior of most Steam users.
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
<br />
This is a bit of a trick question, _don't pick the location physically closest to you, choose the one physically closest to the server._
<br /><br />
Testing shows that picking the physically closest location to you results in Steam rejecting the login attempt.

**What are you trying to do?**
<br />
Choose "Other"

**You're attempting to sign in to Steam from ... If you understand why the locations would not match, you may proceed.**
<br />
Choose "Sign in to Steam"

</details>

<details>
<summary>Error: no container with name or ID "chernarus_chernarus_1" found: no such container</summary>

If you see this error, it's plausible that you changed the folder name in step 1. by default, podman-compose uses the project directory name as the first part of the container name, like `<project-directory-name>_<service-name>_1`.

Use the following command to list all containers:

```bash
podman ps
```

you'll see something like:

```
CONTAINER ID  IMAGE                                                 COMMAND               CREATED         STATUS                       PORTS                                             NAMES
61516d56cfac  registry.godbleak.dev/godbleak/serverz:rootless  unshare --user --...  2 minutes ago  Up 2 minutes ago (healthy)  0.0.0.0:2302->2302/udp, 0.0.0.0:27015->27015/udp  namalsk_namalsk_1
```

In the above, the container is named `namalsk_namalsk_1`, because for that case, the `compose.yml` used to create it was located in a directory named `namalsk`, and the service name was `namalsk`.. Use whatever `podman ps` actually shows you under `NAMES` in the above to confirm the name of the container.

</details>

<br />

<kbd>Ctrl</kbd> + <kbd>C</kbd> to exit the log tail without stopping the container.

#### stopping the server

When you need to stop the server, use:

```bash
podman-compose down
```

This will stop the container and remove it from the system, which is fine as the container itself is designed to be disposable. Starting it again with the command above will re-create it, with the same configuration and without data loss.

### 4. Open firewall ports

> [!TIP]
> If you're behind a router rather than on a VPS with a public IP directly attached, you'll also need to forward these same UDP ports to the server's local IP in your router's settings.

First, return to your sudo-capable user:

```bash
exit
```

Your server needs its game port and query port open over UDP. Using `ufw`:

```bash
sudo ufw allow 2302/udp comment 'DayZ Chernarus'
sudo ufw allow 27015/udp comment 'DayZ Chernarus query'
sudo ufw status
```

You should see something like this:

```
ubuntu@test:~$ sudo ufw status
Status: active

To                         Action      From
--                         ------      ----
2302/udp                   ALLOW       Anywhere                   # DayZ Chernarus
27015/udp                  ALLOW       Anywhere                   # DayZ Chernarus query
2302/udp (v6)              ALLOW       Anywhere (v6)              # DayZ Chernarus
27015/udp (v6)             ALLOW       Anywhere (v6)              # DayZ Chernarus query
```

<details>
<summary>If you don't ... </summary>

And instead you see something like this:

```
ubuntu@test:~$ sudo ufw status
Status: inactive
```

Your firewall is not running.

> [!WARNING]
> Before you enabling your firewall, ensure that if you're connecting to the server via SSH, you add your ssh port (usually port 22) to the firewall rules:
>
> ```bash
> sudo ufw allow 22
> ```
>
> If after enabling the firewall you are disconnected from the server and unable to reconnect, you'll either need physical, console, or IPMI access to your server to fix the firewall rules.

To enable your firewall, run:

```bash
sudo ufw enable
sudo ufw status # to confirm
```

</details>

Return to the `dayz` user:

```bash
su - dayz
```

### 5. Connect to the server

Once you've set up your firewall, you can connect to the server at your server's public IP address on port 2302.

> [!TIP]
> If you're unsure of your server's public IP address, you can often use the following to get it:
>
> ```bash
> curl ip.me
> ```

<br />
<br />

**From here, your server should technically be operational.** You _could_ skip the next steps, however, for long-term use, they're recommended.

### 6. Apply customizations to the server (optional)

#### 6.1 Environment Variables

> [!NOTE]
> For a full list of all the knobs you can tweak, see [Environment Variables](environment_variables.md).

Here's a list of the most commonly used environment variables:

| Variable                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CPU_COUNT`                      | The number of CPU cores to allocate to the server. By default, a container will only use half of the CPUs available. For example, if you have a quad-core CPU, by default the server will use 2 CPUs. If you wanted it to use all 4 cores, you'd set `CPU_COUNT` to 4.                                                                                                                                                                       |
| `SERVER_NAME`                    | This is the name that will appear in the server browser in the DayZ client.                                                                                                                                                                                                                                                                                                                                                                  |
| `DESCRIPTION`                    | This is the description that will appear in the server browser in the DayZ client.                                                                                                                                                                                                                                                                                                                                                           |
| `MOTD`                           | This is an array of messages that will be periodically broadcast to players in-game. The interval between messages is configurable with `MOTD_INTERVAL`.                                                                                                                                                                                                                                                                                     |
| `TEMPLATE`                       | This is the name of the DayZ map to load. For example, if you wanted to run a Sakhal server, you'd set `TEMPLATE` to `dayzOffline.sakhal`.                                                                                                                                                                                                                                                                                                   |
| `MOD_LIST`                       | This is an array of mod IDs to download and enable on the server. If, for example, you wanted to add CF to your server, you'd look at the workshop url for CF: https://steamcommunity.com/workshop/filedetails/?id=1559212036, and set `MOD_LIST` to `"[1559212036]"`. <br /> If you also wanted to add VPPAdminTools (https://steamcommunity.com/workshop/filedetails/?id=1828439124), you'd set `MOD_LIST` to `"[1559212036,1828439124]"`. |
| `SERVER_TIME_ACCELERATION`       | This is the acceleration factor for the server time.                                                                                                                                                                                                                                                                                                                                                                                         |
| `SERVER_NIGHT_TIME_ACCELERATION` | This is the acceleration factor for the server night time. It is multiplied by `SERVER_TIME_ACCELERATION`.                                                                                                                                                                                                                                                                                                                                   |

An example of all of these variables in a compose file:

```yaml
services:
  sakhal:
    image: registry.godbleak.dev/godbleak/serverz:rootless
    stop_grace_period: 2m
    network_mode: "pasta:--ipv4-only"
    environment:
      CPU_COUNT: 4
      SERVER_NAME: "My Super Awesome Sakhal Server"
      DESCRIPTION: "Just a super awesome Sakhal server"
      MOTD: '["My first message", "My second message"]'
      TEMPLATE: "dayzOffline.sakhal"
      MOD_LIST: "[1559212036,1828439124]"
      SERVER_TIME_ACCELERATION: 5.4
      SERVER_NIGHT_TIME_ACCELERATION: 2.7
    volumes:
      - "/home/dayz/servers/sakhal/data:/data"
      - "/home/dayz/servers/sakhal/overrides:/overrides"
      - "/home/dayz/servers/sakhal/install:/install"
      - "/home/dayz/servers/sakhal/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

Notice that this uses a, currently, non-existent `/home/dayz/servers/sakhal` directory and would fail to launch if you didn't create it, and the required subdirectories. However, as the above compose is just an example of setting the environment variables, I'm not going to have you create a whole new directory structure just for this example, that you probably won't run. The change in path is only to be consistent with using the map name (since we set `TEMPLATE` to `dayzOffline.sakhal`, changing the map) as the directory name, which is just a stylistic choice.

#### 6.2 File Patching

As we discussed while creating the compose file, ServerZ utilizes OverlayFS to merge the `install`, `overrides`, and `data` directories into a single merged view the DayZ server itself sees as one directory.

To customize a file — say, `types.xml` for Chernarus — never edit it directly in `install`. Instead, mirror its path under `overrides` and edit the copy there:

```bash
# Mirror the directory tree
mkdir -p ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db
# Copy the file from the install directory the overrides directory
cp ~/servers/chernarus/install/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml \
   ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db/
# Edit the copy
nano ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml
```

The server will see your edited copy in place of the original — you only need to mirror the specific files you're changing, not the whole directory tree.

#### 6.3 Mods

To add a mod, you first need its workshop ID. Browse the [DayZ Workshop](https://steamcommunity.com/app/221100/workshop/), find the mod you want, and grab the number from the end of its URL — for example, `https://steamcommunity.com/sharedfiles/filedetails/?id=1828439124` has an ID of `1828439124`.

Before you set `MOD_LIST`, check the mod's own page or documentation for any **required dependencies** — many mods, especially admin and gameplay-overhaul mods, are built on top of another mod (Community Framework is one of the most common). If one's listed, find its workshop ID the same way, and put it in `MOD_LIST` ahead of the mod that depends on it.

Set `MOD_LIST` to a JSON array of these IDs, as a string:

```yaml
environment:
  MOD_LIST: "[1559212036,1828439124]"
```

For every mod in that list, ServerZ downloads it, symlinks it into the server's mod folder, links its keys, and adds it to the server's launch parameters — including telling connecting clients which mods they need, since the server is what enforces that match in the first place. That's the entire installation process most mods' own documentation walks you through by hand — subscribing, copying `@ModName` folders around, editing batch files, copying keys — already done for you.

What ServerZ can't do is anything mod-specific: in-game permissions, admin lists, config files the mod generates on its own first run, anything that lives in the mod's own settings rather than in `serverDZ.cfg`. For that, you're reading the mod's own documentation — its Steam Workshop page, GitHub, wiki, or Discord, whatever it actually has. The example below walks through one real mod end to end, including the point where ServerZ's job ends and the mod's own documentation takes over.

<a name="example-setting-up-vpp-admin-tools"></a>

<details>
<summary>Example: Setting up VPP Admin Tools</summary>

> [!NOTE]
> This example is intentionally verbose to not just show you "use this `MOD_LIST` for VPPAdminTools", but to show you how the IDs for the `MOD_LIST` were found in the first place, hopefully giving you a pattern to find the IDs required for any mod. It's also verbose, because it takes you through getting the minimal configuration required for VPPAdminTools set.

Start at the [DayZ Workshop](https://steamcommunity.com/app/221100/workshop/) and search for VPPAdminTools by "DaOne". Its page is at `https://steamcommunity.com/sharedfiles/filedetails/?id=1828439124` — the ID is `1828439124`.

The workshop page states a required dependency on Community Framework (CF) — `https://steamcommunity.com/sharedfiles/filedetails/?id=1559212036`, ID `1559212036`. CF goes in `MOD_LIST` first:

```yaml
environment:
  MOD_LIST: "[1559212036,1828439124]" # CF (required dependency), VPPAdminTools
```

The workshop page also links to a fuller [Installation & Configuration wiki](https://github.com/VanillaPlusPlus/VPP-Admin-Tools/wiki/Installation-&-Configuration). Following its Dedicated Server / Local instructions, almost everything it walks you through by hand — subscribing in Steam, copying `@CF` and `@VPPAdminTools` into the server root, copying their `Keys` folders, adding `-mod=@CF;@VPPAdminTools` to the launch parameters — is exactly what setting `MOD_LIST` above already did for you.

Restart the server once with that set:

```bash
podman-compose restart chernarus
```

That's the entire first half of the wiki done. What's left is mod-specific, and relies on directories that only exists after that restart, when it auto-generates its own config under your data directory's `profiles`:

```
~/servers/chernarus/data/223350/profiles/VPPAdminTools/Permissions/SuperAdmins/SuperAdmins.txt
~/servers/chernarus/data/223350/profiles/VPPAdminTools/Permissions/credentials.txt
```

To make yourself an admin, edit `SuperAdmins.txt` and add your [SteamID64](https://steamid.io/) — one per line, no leading or trailing spaces:

```bash
nano ~/servers/chernarus/data/223350/profiles/VPPAdminTools/Permissions/SuperAdmins/SuperAdmins.txt
```

```
76561198420222029
```

Make sure it's actually your Steam64 ID and not just the number from your custom profile URL — they're not the same thing, and VPP's own troubleshooting notes this is the single most common reason the tool silently does nothing in-game.

Then set an admin password in `credentials.txt`:

```bash
nano ~/servers/chernarus/data/223350/profiles/VPPAdminTools/Permissions/credentials.txt
```

Follow the instructions written inside the file itself — it explains how the password gets hashed in place. A password here is required by default; the mod also offers disabling that requirement entirely via `vppDisablePassword = 1;` in `serverDZ.cfg`, which ServerZ can't help with yet (more on that below).

Save both files and restart once more to pick them up:

```bash
podman-compose restart chernarus
```

Connect to the server, and the mod's default keybinds (End to toggle the tools on, Home to open the menu) should now work for the Steam64 ID you added.

ServerZ can't help with `vppDisablePassword` yet — `serverDZ.cfg` is one of the files ServerZ generates for you, modeled against the settings Bohemia itself documents for that file (server identity, passwords, gameplay rules, mission selection), not the custom keys mods like this one graft on by relying on the file tolerating unrecognized entries. There's no environment variable for it, and no clean override path either, since the generated file already takes precedence over `overrides` at this same path. Support for setting arbitrary keys like this is planned, but isn't there yet — for now, a password is required with VPP Admin Tools + ServerZ.

Anything beyond this — user groups, in-game permission tweaks, the mod's other plugins — follows this same pattern: find the file under `profiles`, edit it, restart. The wiki's own Configuration section covers what each one does.

Your compose file, with everything from this example applied:

```yaml
services:
  chernarus:
    image: registry.godbleak.dev/godbleak/serverz:rootless
    restart: unless-stopped
    stop_grace_period: 2m
    network_mode: "pasta:--ipv4-only"
    environment:
      MOTD: '["DayZ in a Box"]'
      MOD_LIST: "[1559212036,1828439124]" # CF (required dependency), VPPAdminTools
    volumes:
      - "/home/dayz/servers/chernarus/data:/data"
      - "/home/dayz/servers/chernarus/overrides:/overrides"
      - "/home/dayz/servers/chernarus/install:/install"
      - "/home/dayz/servers/chernarus/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

</details>

#### 6.4 Community Maps

To run a community-made map instead of the default Chernarus, you need three things: the map's files (via `MAP_URL` or a workshop ID), a `MISSION_PATH` pointing at the map's mission folder inside those files, and a matching `TEMPLATE` value. Most of the actual difficulty isn't ServerZ's settings — it's finding the right repo, the right folder inside it, and reading whatever license or setup terms the map author attaches, since every community map handles distribution differently. The example below walks through one real, currently-tested map end to end — see [Tested Maps](doc/tested_maps.md) for others.

<a name="example-setting-up-deer-isle"></a>

<details>
<summary>Example: Setting up Deer Isle</summary>

> [!NOTE]
> This example is intentionally verbose to not just show you "use these values for Deer Isle", but to show you how those were found in the first place. Which hopefully gives you an idea of the pattern to use to find these values for any map.

Search the [DayZ Workshop](https://steamcommunity.com/app/221100/workshop/) for Deer Isle by "JohnMcLane1". From the end of the workshop url (`https://steamcommunity.com/sharedfiles/filedetails/?id=1602372402`), note the workshop ID (`1602372402`). The page will direct you to the author's website: `deerisle-wiki.jimdosite. com`. Copy and paste the URL into your browser's address bar, remove the space between `jimdosite.` and `com`, and proceed to the website.

In the navigation bar at the top of the author's website, click the "Download & Licence" link, and scroll down until you come across the licence terms for the server files. Accepting it ("I have read, understand and accept the deerisle licence.") reveals a link to the author's [GitHub profile](https://github.com/johnmclane666), from there open the [`Deerisle-Stable`](https://github.com/johnmclane666/Deerisle-Stable) repository.

Click the "Code" button, and copy the HTTPS URL of the repository (`https://github.com/johnmclane666/Deerisle-Stable.git`), we'll use it to tell ServerZ to download this repo to our `maps` directory. You'll notice two folders in the repo, `V5.3` and `V5.9`, if you click on `V5.9`, you'll see the mission folder inside it, `empty.deerisle`. This is what `MISSION_PATH` will point to (which tells the server to create a copy of it from the `maps` directory to the missions folder), `TEMPLATE` will tell the server to load it from that mission folder.

It's not stated anywhere, but [CF](https://steamcommunity.com/workshop/filedetails/?id=1559212036) is a required dependency for Deer Isle, you'd follow the same pattern above to find it's workshop ID (`1559212036`).

Point `MAP_URL` at the copied URL, and `MISSION_PATH` at the mission folder inside `V5.9`, add CF's and Deer Isle's workshop IDs to `MOD_LIST`, and set `TEMPLATE` to `empty.deerisle`:

```yaml
environment:
  MOD_LIST: "[1559212036,1602372402]" # CF, Deer Isle itself
  MAP_URL: https://github.com/johnmclane666/Deerisle-Stable.git
  MISSION_PATH: "/install/223350/maps/Deerisle-Stable/V5.9/empty.deerisle"
  TEMPLATE: "empty.deerisle"
```

Deer Isle's mission files — what `MISSION_PATH` and `TEMPLATE` point at — come from the GitHub repo via `MAP_URL`. Deer Isle is still in `MOD_LIST` regardless, for the same reason any mod needs to be there: the server tells connecting clients which mods to load, so without it, clients wouldn't know to load Deer Isle's assets at all, even with the mission files already in place.

Restart, connect, and you should land on Deer Isle instead of Chernarus.

Your compose file, with everything from this example applied:

```yaml
services:
  deerisle: # Note the changed service name, not required, but recommended for your own sanity
    image: registry.godbleak.dev/godbleak/serverz:rootless
    restart: unless-stopped
    stop_grace_period: 2m
    network_mode: "pasta:--ipv4-only"
    environment:
      MOTD: '["DayZ in a Box"]'
      MOD_LIST: "[1559212036,1602372402]" # CF, Deer Isle itself
      MAP_URL: https://github.com/johnmclane666/Deerisle-Stable.git
      MISSION_PATH: "/install/223350/maps/Deerisle-Stable/V5.9/empty.deerisle"
      TEMPLATE: "empty.deerisle"
    volumes:
      # Potentially change this to point at a "deerisle" directory, see step 1 for changing the path
      - "/home/dayz/servers/chernarus/data:/data"
      - "/home/dayz/servers/chernarus/overrides:/overrides"
      - "/home/dayz/servers/chernarus/install:/install"
      - "/home/dayz/servers/chernarus/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

</details>

#### 6.5 Scheduled Restarts

DayZ servers benefit from a periodic restart — memory and accumulated world state both creep up the longer a server stays up, and a routine restart clears that out. Most servers restart every few hours; once every 4 hours is a common starting point, more often for heavily modded servers, less often for vanilla. Bohemia's wiki recommends doing this the graceful way, through `messages.xml`, specifically to avoid side effects on player characters and the server's persistence saving.

`messages.xml` lives alongside `types.xml`, in the same mission folder, so it follows the exact override pattern from [6.2](#62-file-patching):

```bash
mkdir -p ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db
nano ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db/messages.xml
```

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<messages>
	<message>
		<deadline>240</deadline>
		<shutdown>1</shutdown>
		<text>#name will restart in #tmin minutes.</text>
	</message>
</messages>
```

A `deadline` of `240` minutes (4 hours) with the implied Countdown flag enabled handles the warnings for you — DayZ automatically sends this message at 90, 60, 45, 30, 20, 15, 10, 5, 2, and 1 minute before the deadline, with `#tmin` filled in each time. You don't write each warning separately; one message with a `deadline` does the whole sequence.

You don't need to separately trigger the container restart — by default, `EXIT_WITH_CHILD` is `true`, which means ServerZ exits when the DayZServer process it's running exits, for any reason, including the shutdown `messages.xml` triggers. Since the compose file currently uses `restart: unless-stopped`, compose brings the container straight back up once it exits — the countdown reaching zero is the entire trigger, end to end.

> [!IMPORTANT]
> If for some reason you've set `EXIT_WITH_CHILD: false`, expect DayZServer to shutdown, but ServerZ to continue running, meaning the server will not come back up until you manually restart it.

<br />
<br />

> [!NOTE]
> The rest of this guide continues with the compose file from [step 2](#2-create-the-compose-file), not whatever you ended up with after step 6. Step 6 is entirely optional, and what you did inside it — none of it, just 6.1, all the way through a worked example — doesn't change anything about how auto-start, updating, or backups work. They all operate on the compose file and its volumes as a whole, not on which specific environment variables happen to be set inside it.
>
> One thing worth being deliberate about, though: the service name (`chernarus`) and the directory it lives in (`~/servers/chernarus`) are just labels — ServerZ doesn't care what either is called. But step 7 onward propagates that service name mechanically into the container name, the systemd unit filename, and every command you'll run against it from here on. If you switch this server to a different map later — say, [Deer Isle](#example-setting-up-deer-isle) — nothing breaks if you leave the name and path as `chernarus`, but you'll be running `systemctl status container-chernarus_chernarus_1.service` about a server that isn't Chernarus anymore. Renaming both now, before step 7 generates anything, is cheaper than untangling the mismatch later.

### 7. Auto-start on boot with `podman-compose systemd`

This step will bring your server back after a reboot without having to manually start it.

From the `~/servers/chernarus` directory, register the project with systemd:

```bash
cd ~/servers/chernarus
podman-compose systemd -a register
```

Then stop the compose-managed container and hand control to systemd:

```bash
podman-compose down
systemctl --user daemon-reload
systemctl --user enable --now 'podman-compose@chernarus'
```

#### Managing the server going forward

```bash
systemctl --user status 'podman-compose@chernarus'   # check status
journalctl --user -xeu 'podman-compose@chernarus'    # logs
systemctl --user restart 'podman-compose@chernarus'  # restart
systemctl --user stop 'podman-compose@chernarus'     # stop
```

These systemctl commands manage the whole project and can be run from any directory. After any config change, restart the service, and optionally follow the logs.

```bash
systemctl --user restart 'podman-compose@chernarus'
journalctl --user -xeu 'podman-compose@chernarus' -f
```

### 8. Updating the server

Every restart re-validates the server against Steam, unconditionally — there's no separate "check for updates first" step. If nothing's changed since the last run, that's just fast validation, not a download. If DayZ actually shipped an update, you'll get a real download, and how long that takes depends on your connection, not anything ServerZ controls.

```bash
systemctl --user restart 'podman-compose@chernarus'
journalctl --user -u 'podman-compose@chernarus' -f
```

If you specifically want to skip this check — say, you're just restarting to pick up a config change and know you're already current — set `SKIP_UPDATE: true` in the compose file's environment.

A major DayZ update is a good opportunity to give your `overrides` a second look. They're copies of files from a specific point in time, and an update can change the file they're copied from out from under them — a new field added to `types.xml`'s schema, for instance, that your overridden copy won't have, because it was copied before that field existed. There's no general rule for what to check, since it depends entirely on what you've overridden and what changed — but `diff` will show you exactly what's different between your copy and the freshly-updated original:

```bash
diff ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml \
     ~/servers/chernarus/install/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml
```

Lines starting with `<` are unique to your override, `>` are unique to the freshly-updated original — anything only on the `>` side is new or changed upstream that your override doesn't have. Run this for anything you're tracking in `overrides`, rather than assuming an override that worked last week still matches this week's expectations.

### 9. Backups

Your save state lives in `data` (the OverlayFS upper layer — thin by design, since it only contains the delta from the base install), and any customizations you've made live in `overrides`. This section will setup a simple cron-based backup of both.

First, create somewhere for the backups to actually land:

```bash
mkdir -p ~/backups
```

Then schedule the backup itself:

```bash
crontab -e
```

```
no crontab for dayz - using an empty one

Select an editor.  To change later, run 'select-editor'.
  1. /bin/nano        <---- easiest
  2. /usr/bin/vim.tiny
  3. /bin/ed

Choose 1-3 [1]:
```

```cron
0 4 * * * tar -czf /home/dayz/backups/chernarus-$(date +\%F).tar.gz --exclude='data/.overlay-work' -C /home/dayz/servers/chernarus data overrides
```

This runs daily at 4 AM, archiving `data` and `overrides` from the chernarus directory into a dated `.tar.gz` in `~/backups` — `$(date +\%F)` is what gives each day's backup a unique name (`chernarus-2026-06-28.tar.gz`) instead of overwriting the same file every night. If you want a different schedule, [crontab.guru](https://crontab.guru/) is a quick way to build or decode a cron expression without memorizing the syntax.

Consider syncing the `backups` directory off-host (e.g. to object storage) so a disk failure doesn't take your backups with it — getting it there is on you, the same way getting it back is below. You don't need to back up `install` — it's just the Steam-managed base game and can be re-downloaded.

#### Restoring from a backup

This covers restoring onto the same host the backup came from — pulling a backup down from wherever you sent it off-host is, like sending it there in the first place, on you; the mechanics depend entirely on where you put it.

Stop the service first, so nothing's writing to `data` while you're replacing it:

```bash
systemctl --user stop 'podman-compose@chernarus'
```

Move the existing `data` and `overrides` aside rather than deleting them outright — if anything about the restore goes wrong, you still have them to fall back to. A fresh, empty destination also matters here: a plain extraction only adds and overwrites files, it doesn't remove anything that's not in the backup, so extracting into the existing directories would leave stale or corrupted files behind from after the backup was taken.

```bash
cd ~/servers/chernarus
mv data data.old
mv overrides overrides.old
mkdir -p data overrides
```

Pick the backup you want and extract it:

```bash
tar -xzf ~/backups/chernarus-2026-06-28.tar.gz
```

Then bring the service back up and confirm everything actually came back correctly — connect to the server, check that the state and any customizations you expected are there:

```bash
systemctl --user start 'podman-compose@chernarus'
```

Once you've confirmed the restore worked, clean up the old copies:

```bash
rm -rf ~/servers/chernarus/data.old ~/servers/chernarus/overrides.old
```

That's the whole sequence — a single DayZ server, configured, running, set to restart on boot, updating itself, backed up daily, and restorable. Nothing past this point is required to keep running it that way.

What follows is for running more than one map at once. If that's not something you need, you're done with this guide; the [Troubleshooting](#troubleshooting) section at the very end still applies either way.

## Migrate to a multi-container setup

If you followed [Set up a single server](#set-up-a-single-server-chernarus), this picks up from where step 9 left off — undoing the single-server-specific pieces before restructuring anything, so they don't collide with what this section recreates.

First, remove the ufw rules you added in single-server's [step 4](#4-configure-the-firewall) — the multi-container setup will add its own rules

```bash
exit # if you're still the `dayz` user
sudo ufw delete allow 2302/udp comment 'DayZ Chernarus'
sudo ufw delete allow 27015/udp comment 'DayZ Chernarus query'
su - dayz
```

Then, disable and remove the systemd registration from single-server's [step 7](#7-auto-start-on-boot-with-podman-compose-systemd) — it's about to be replaced with a multi-service version, and leaving the old one enabled means systemd still tries to start a project that won't exist in this new shape:

```bash
systemctl --user disable --now 'podman-compose@chernarus'
cd ~/servers/chernarus
podman-compose -p "chernarus" systemd -a unregister
systemctl --user daemon-reload
systemctl --user reset-failed
```

Then remove the single-server backup line from single-server's [step 9](#9-backups) — this section adds a per-map version that supersedes it, and leaving both in place means a duplicate backup running every night:

```bash
crontab -e
# remove the line backing up chernarus that you added in step 9
```

If you also set up [6.5 Scheduled Restarts](#65-scheduled-restarts), no teardown is needed there — `messages.xml` lives under `overrides`, which survives the directory restructuring below untouched.

From `~/servers/chernarus`, move things up a level and rename:

```bash
cd ~/servers
mv chernarus/compose.yml .
mv chernarus/install ./_install
mv chernarus/steam ./_steam
```

You should now have:

```
~/servers/
├── compose.yml
├── _install/
├── _steam/
└── chernarus/
    ├── data/
    └── overrides/
```

That's the migration done — the rest is identical to setting this up from scratch, covered next.

## Set up multiple servers

This section walks through setting up two DayZ servers, a single Chernarus server, and a single Livonia server. Adding more servers is just a matter of repeating the pattern, with a new `data`/`overrides` pair for each map, and a unique `PORT`/`STEAM_QUERY_PORT`/`ports:` pair for each service block in the compose file.

> [!NOTE]
> If you just finished [Migrate to a multi-container setup](#migrate-to-a-multi-container-setup), skip ahead to [step 2](#2-update-the-compose-file) — step 1 below is exactly what migration just produced.

### 1. Create the directory structure

Create a shared `_install`/`_steam` pair for Steam-managed files, plus a `data`/`overrides` pair for each map:

```bash
mkdir -p ~/servers/_install ~/servers/_steam
mkdir -p ~/servers/chernarus/{data,overrides}
mkdir -p ~/servers/livonia/{overrides,data}
cd ~/servers
```

### 2. Update the compose file

Below, in addition to adding the Livonia server, we're also centralizing responsibility of everything Steam-related to a single `steam` service.

```bash
cd ~/servers
nano compose.yml
```

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
      - "steam"
    environment:
      MOTD: '["DayZ in a Box"]'
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
      - "steam"
    environment:
      MOTD: '["DayZ in a Box"]'
      TEMPLATE: dayzOffline.enoch
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

Notice `PORT`/`STEAM_QUERY_PORT` and the `ports:` mapping use the same number on both sides — `2303:2303`, not the more familiar Docker pattern of mapping an arbitrary host port to a container's default internal one (`2303:2302`, say). That's deliberate: DayZ reports its own port back to clients and the Steam master server as part of the game protocol itself, so the server has to be told the truth about whatever port it's actually reachable on externally. Remap it the usual container way and the server would report `2302` while actually only being reachable on `2303` — the numbers stop agreeing with each other, and the server doesn't show up correctly even though the port is technically open.

The actual numbers themselves are not fixed — `2303`/`27016`, `2303`/`2313`, or any other pair work fine, ServerZ and DayZ don't enforce any particular relationship between the two. What matters is telling ServerZ the real port (`PORT`/`STEAM_QUERY_PORT`) and exposing that exact same port on the host (`ports:`), so the announced port and the reachable port are always the same number.

### 3. Start the servers

```bash
podman-compose up -d
podman-compose logs -f
```

To add a third map later, copy the pattern: a new `~/servers/<map>/{data,overrides}` directory, a new service block pointing at the shared `_install`/`_steam`, and a unique, matching `PORT`/`STEAM_QUERY_PORT`/`ports:` pair.

### 4. Open firewall ports

> [!TIP]
> If you're behind a router rather than on a VPS with a public IP directly attached, you'll also need to forward these same UDP ports to the server's local IP in your router's settings.

First, return to your sudo-capable user:

```bash
exit
```

Your servers needs their game ports and query ports open over UDP. Using `ufw`:

```bash
sudo ufw allow 2302/udp comment 'DayZ Chernarus'
sudo ufw allow 27015/udp comment 'DayZ Chernarus query'
sudo ufw allow 2303/udp comment 'DayZ Livonia'
sudo ufw allow 27016/udp comment 'DayZ Livonia query'
sudo ufw status
```

You should see something like this:

```
ubuntu@test:~$ sudo ufw status
Status: active

To                         Action      From
--                         ------      ----
2302/udp                   ALLOW       Anywhere                   # DayZ Chernarus
27015/udp                  ALLOW       Anywhere                   # DayZ Chernarus query
2303/udp                   ALLOW       Anywhere                   # DayZ Livonia
27016/udp                  ALLOW       Anywhere                   # DayZ Livonia query
2302/udp (v6)              ALLOW       Anywhere (v6)              # DayZ Chernarus
27015/udp (v6)             ALLOW       Anywhere (v6)              # DayZ Chernarus query
2303/udp (v6)              ALLOW       Anywhere (v6)              # DayZ Livonia
27016/udp (v6)             ALLOW       Anywhere (v6)              # DayZ Livonia query

```

<details>
<summary>If you don't ... </summary>

And instead you see something like this:

```
ubuntu@test:~$ sudo ufw status
Status: inactive
```

Your firewall is not running.

> [!WARNING]
> Before you enabling your firewall, ensure that if you're connecting to the server via SSH, you add your ssh port (usually port 22) to the firewall rules:
>
> ```bash
> sudo ufw allow 22
> ```
>
> If after enabling the firewall you are disconnected from the server and unable to reconnect, you'll either need physical, console, or IPMI access to your server to fix the firewall rules.

To enable your firewall, run:

```bash
sudo ufw enable
sudo ufw status # to confirm
```

</details>

Return to the `dayz` user:

```bash
su - dayz
```

### 5. Connect to the servers

Once your firewall's set up, you can connect to each server independently at your server's public IP address, on that map's own port — `2302` for Chernarus, `2303` for Livonia in the example above.

> [!TIP]
> If you're unsure of your server's public IP address, you can often use the following to get it:
>
> ```bash
> curl ip.me
> ```

From here, both servers should technically be operational. You _could_ skip the next steps, however, for long-term use, they're recommended.

### 6. Apply customizations to the servers (optional)

#### 6.1 Environment Variables

> [!NOTE]
> For a full list of all the knobs you can tweak, see [Environment Variables](environment_variables.md).

These work the same way whether you're running one map or several — they're set per service, so each map gets its own values independent of the others. Here's a list of the most commonly used:

| Variable                         | Description                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CPU_COUNT`                      | The number of CPU cores to allocate to that map's server. By default, a container will only use half of the CPUs available.                         |
| `SERVER_NAME`                    | The name that will appear in the server browser in the DayZ client, for that map.                                                                   |
| `DESCRIPTION`                    | The description that will appear in the server browser, for that map.                                                                               |
| `MOTD`                           | An array of messages periodically broadcast to players on that map. The interval is configurable with `MOTD_INTERVAL`.                              |
| `TEMPLATE`                       | The DayZ map that service loads — this is how Chernarus and Livonia end up being different maps in the first place, despite running the same image. |
| `MOD_LIST`                       | An array of mod IDs to download and enable, per map. See [6.3](#63-mods) below for a worked example.                                                |
| `SERVER_TIME_ACCELERATION`       | The acceleration factor for that map's server time.                                                                                                 |
| `SERVER_NIGHT_TIME_ACCELERATION` | The acceleration factor for that map's server night time, multiplied by `SERVER_TIME_ACCELERATION`.                                                 |

Add the variables to the environment block for the map they should affect. For example, this expands Livonia's existing environment block; keep its existing `PORT`, `STEAM_QUERY_PORT`, `STEAM_API_ADAPTER`, and `STEAM_CONTENT_SOCKET` entries alongside these values:

```yaml
livonia:
  environment:
    CPU_COUNT: 4
    SERVER_NAME: "My Super Awesome Livonia Server"
    DESCRIPTION: "Just a super awesome Livonia server"
    MOTD: '["My first message", "My second message"]'
    TEMPLATE: "dayzOffline.enoch"
    MOD_LIST: "[1559212036,1828439124]"
    SERVER_TIME_ACCELERATION: 5.4
    SERVER_NIGHT_TIME_ACCELERATION: 2.7
    PORT: 2303
    STEAM_QUERY_PORT: 27016
    STEAM_API_ADAPTER: "remote"
    STEAM_CONTENT_SOCKET: "/root/.steam/depot.sock"
```

Restart just that map's service to pick up the change — not `steam`, and not the other maps:

```bash
cd ~/servers
podman-compose restart livonia
```

#### 6.2 File Patching

ServerZ uses OverlayFS to give each map one merged game directory. The shared `_install` directory and that map's own `overrides` directory are read-only lower layers, with `overrides` taking precedence wherever it contains the same file. That map's `data` directory is the writable upper layer, which captures everything the running server changes.

To customize a file for Livonia specifically — say, `types.xml` — never edit the shared `_install` copy directly. Instead, mirror its path into Livonia's own `overrides` directory and edit the copy there. Editing `_install` would affect every map that shares it, and would be overwritten the next time Steam updates the game:

```bash
# Mirror the directory tree
mkdir -p ~/servers/livonia/overrides/223350/mpmissions/dayzOffline.enoch/db
# Copy the file from the shared install directory into Livonia's own overrides
cp ~/servers/_install/223350/mpmissions/dayzOffline.enoch/db/types.xml \
   ~/servers/livonia/overrides/223350/mpmissions/dayzOffline.enoch/db/
# Edit the copy
nano ~/servers/livonia/overrides/223350/mpmissions/dayzOffline.enoch/db/types.xml
```

Chernarus is unaffected — its own `overrides` are untouched, and `_install` itself never changed.

#### 6.3 Mods

To add a mod, you first need its workshop ID. Browse the [DayZ Workshop](https://steamcommunity.com/app/221100/workshop/), find the mod you want, and grab the number from the end of its URL — for example, `https://steamcommunity.com/sharedfiles/filedetails/?id=1828439124` has an ID of `1828439124`.

Before you set `MOD_LIST`, check the mod's own page or documentation for a **required dependency** — many mods, especially admin and gameplay-overhaul mods, are built on top of another mod (Community Framework is one of the most common). If one's listed, find its workshop ID the same way, and put it in `MOD_LIST` ahead of the mod that depends on it.

Set `MOD_LIST` to a JSON array of workshop IDs, as a string, in the environment block for the map that should use them:

```yaml
environment:
  MOD_LIST: "[1559212036,1828439124]"
```

For every mod in a map's `MOD_LIST`, ServerZ downloads it, symlinks it into that map's mod folder, links its keys, and adds it to that map's launch parameters — including telling connecting clients which mods they need. This all happens per map: setting `MOD_LIST` on Livonia doesn't install anything for Chernarus, even though both maps download from the same shared `_install`.

Each map also keeps its own independent copy of whatever a mod generates at runtime, even though `_install` is shared. VPP Admin Tools running on Livonia gets its own `SuperAdmins.txt`, separate from Chernarus's, because each map's mod-generated config lives under that map's own `data`, never the shared `_install`.

<details>
<summary>Example: Setting up VPP Admin Tools on Livonia</summary>

Start at the [DayZ Workshop](https://steamcommunity.com/app/221100/workshop/) and search for VPPAdminTools. Its page is at `https://steamcommunity.com/sharedfiles/filedetails/?id=1828439124` — the ID is `1828439124`.

The workshop page states a required dependency on Community Framework (CF) — `https://steamcommunity.com/sharedfiles/filedetails/?id=1559212036`, ID `1559212036`. CF goes in Livonia's `MOD_LIST` first:

```bash
cd ~/servers
nano compose.yml
# add MOD_LIST: "[1559212036,1828439124]" to livonia's environment block — CF (required dependency), VPPAdminTools
```

The workshop page also links to a fuller [Installation & Configuration wiki](https://github.com/VanillaPlusPlus/VPP-Admin-Tools/wiki/Installation-&-Configuration). Following its Dedicated Server / Local instructions, almost everything it walks you through by hand — subscribing in Steam, copying `@CF` and `@VPPAdminTools` into the server root, copying their `Keys` folders, adding `-mod=@CF;@VPPAdminTools` to the launch parameters — is exactly what setting `MOD_LIST` above already did for you.

Restart just Livonia with that set:

```bash
podman-compose restart livonia
```

That's the entire first half of the wiki done. What's left is genuinely mod-specific, and only exists after the mod's first run, when it auto-generates its own config under Livonia's own `data` — not the shared `_install`, and not Chernarus's `data` either, even if Chernarus is running the same mod:

```
~/servers/livonia/data/223350/profiles/VPPAdminTools/Permissions/SuperAdmins/SuperAdmins.txt
~/servers/livonia/data/223350/profiles/VPPAdminTools/Permissions/credentials.txt
```

To make yourself an admin, edit `SuperAdmins.txt` and add your [Steam64 ID](https://steamid.io/) — one per line, no leading or trailing spaces:

```bash
nano ~/servers/livonia/data/223350/profiles/VPPAdminTools/Permissions/SuperAdmins/SuperAdmins.txt
```

```
76561198420222029
```

Make sure it's actually your Steam64 ID and not just the number from your custom profile URL — they're not the same thing, and VPP's own troubleshooting notes this is the single most common reason the tool silently does nothing in-game.

Then set an admin password in `credentials.txt`, following the instructions written inside the file — it explains how the password gets hashed in place. A password here is required by default; the mod also offers disabling that requirement entirely via `vppDisablePassword = 1;` in `serverDZ.cfg`, which ServerZ can't help with yet — `serverDZ.cfg` is generated against the settings Bohemia itself documents for that file, not custom keys mods graft on, so there's no env var or override path for it. Support for arbitrary keys like this is planned, but isn't there yet; for now, set the password instead.

Save both files and restart once more to pick them up:

```bash
podman-compose restart livonia
```

Connect to the server, and the mod's default keybinds (End to toggle the tools on, Home to open the menu) should now work for the Steam64 ID you added.

If you also want VPP on Chernarus, repeat this against Chernarus's own `MOD_LIST` and `data` path — the two installs don't share anything beyond the base game files in `_install`, so setting one up doesn't configure the other.

</details>

#### 6.4 Community Maps

To run a community-made map as one of your services, you need three things: the map's files (via `MAP_URL` or a workshop ID), a `MISSION_PATH` pointing at the map's mission folder inside those files, and a matching `TEMPLATE` value. A community map is just another service block in the same compose file — the same shape as Chernarus or Livonia, with its own `data`/`overrides` and a unique port pair, sharing the same `_install`/`_steam` everything else does.

Most of the actual difficulty isn't ServerZ's settings — it's finding the right repo, the right folder inside it, and reading whatever license or setup terms the map author attaches, since every community map handles distribution differently.

`MAP_URL` tells ServerZ where to download the map's server files, `MISSION_PATH` identifies the mission folder inside those files, and `TEMPLATE` tells DayZ which mission to load. `MISSION_PATH` starts with `/install/...` because it is the path inside the container. Every map container sees its Steam-managed files at `/install`, which resolves to the shared `_install` directory on the host. See [`doc/tested_maps.md`](doc/tested_maps.md) for other tested maps.

<details>
<summary>Example: Adding Deer Isle as a third map</summary>

Search the [DayZ Workshop](https://steamcommunity.com/app/221100/workshop/) for Deer Isle. Its Steam page exists, but — unusually for a workshop listing — it explicitly tells you the workshop page is only there for the download itself, and points you to the map's actual homepage for everything else: `deerisle-wiki.jimdosite.com`.

In the navigation bar at the top of the author's website, click the "Download & Licence" link, and scroll down until you come across the licence terms for the server files. Accepting it ("I have read, understand and accept the deerisle licence.") reveals a link to the author's [GitHub profile](https://github.com/johnmclane666), from there open the [`Deerisle-Stable`](https://github.com/johnmclane666/Deerisle-Stable) repository.

The repo has no README — just two folders, `V5.3` and `V5.9`, with nothing explaining the difference. `V5.3` is the old version; `V5.9` is current. There's no way to know that from the repo itself — it's the kind of thing you'd only know from the map's Discord, or from someone else having already worked it out, which is exactly what [`doc/tested_maps.md`](doc/tested_maps.md) is for.

Give it its own directory and add a third service, pointing `MAP_URL` at the repo and `MISSION_PATH` at the mission folder inside `V5.9` specifically — not `V5.3` — sharing the same `_install`/`_steam` the other two already use:

```bash
mkdir -p ~/servers/deerisle/{data,overrides}
cd ~/servers
nano compose.yml
```

```yaml
deerisle:
  image: registry.godbleak.dev/godbleak/serverz:rootless
  restart: unless-stopped
  stop_grace_period: 2m
  network_mode: "pasta:--ipv4-only"
  depends_on:
    - "steam"
  environment:
    MOD_LIST: "[1559212036,1602372402]" # CF, Deer Isle itself
    MAP_URL: https://github.com/johnmclane666/Deerisle-Stable.git
    MISSION_PATH: "/install/223350/maps/Deerisle-Stable/V5.9/empty.deerisle"
    TEMPLATE: "empty.deerisle"
    PORT: 2304
    STEAM_QUERY_PORT: 27017
    STEAM_API_ADAPTER: "remote"
    STEAM_CONTENT_SOCKET: "/root/.steam/depot.sock"
  volumes:
    - "/home/dayz/servers/deerisle/data:/data"
    - "/home/dayz/servers/deerisle/overrides:/overrides"
    - "/home/dayz/servers/_install:/install"
    - "/home/dayz/servers/_steam:/root/.steam"
  ports:
    - 2304:2304/udp
    - 27017:27017/udp
```

Deer Isle's mission files — what `MISSION_PATH` and `TEMPLATE` point at — come from the GitHub repo via `MAP_URL`. Deer Isle is still in `MOD_LIST` regardless, for the same reason any mod needs to be there: the server tells connecting clients which mods to load, so without it, clients wouldn't know to load Deer Isle's assets at all, even with the mission files already in place.

`2304`/`27017` are just the next pair after Chernarus's and Livonia's, following the same announced-port-matches-reachable-port rule from [step 4](#4-open-firewall-ports) — not a requirement to count sequentially, just convenient here. Open those two ports the same way, then bring the new service up:

```bash
sudo ufw allow 2304/udp comment 'DayZ Deer Isle'
sudo ufw allow 27017/udp comment 'DayZ Deer Isle query'
podman-compose up -d
```

Chernarus and Livonia are both untouched — Deer Isle downloads into the same shared `_install`, but its mission, mods, and `data`/`overrides` are entirely its own.

</details>

#### 6.5 Scheduled Restarts

DayZ servers benefit from a periodic restart — memory and accumulated world state both creep up the longer a server stays up, and a routine restart clears that out. Warning players before it happens matters too, and Bohemia's own wiki recommends doing this the graceful way, through `messages.xml`, specifically to avoid side effects on player characters and the server's persistence saving. With multiple maps, each one's restart schedule is entirely its own — there's no reason Chernarus and Livonia need to restart on the same cadence, and nothing here assumes they do.

`messages.xml` lives under each map's own `overrides`, following the same per-map pattern as [6.2](#62-file-patching):

```bash
mkdir -p ~/servers/livonia/overrides/223350/mpmissions/dayzOffline.enoch/db
nano ~/servers/livonia/overrides/223350/mpmissions/dayzOffline.enoch/db/messages.xml
```

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<messages>
	<message>
		<deadline>240</deadline>
		<shutdown>1</shutdown>
		<text>#name will restart in #tmin minutes.</text>
	</message>
</messages>
```

A `deadline` of `240` minutes (4 hours) with the implied Countdown flag enabled handles the warnings for you — DayZ automatically sends this message at 90, 60, 45, 30, 20, 15, 10, 5, 2, and 1 minute before the deadline. You don't write each warning separately.

You don't need to separately trigger the container restart for Livonia. By default, `EXIT_WITH_CHILD` is `true`, so ServerZ exits when that map's DayZServer process exits, including when the shutdown in `messages.xml` reaches its deadline. The compose-managed restart policy then brings that map's container back up.

The shared `steam` service is untouched by any individual map's `messages.xml`: restarting Livonia at 4 AM does not restart `steam`, and does not affect Chernarus or any other map sharing it.

If you've set `EXIT_WITH_CHILD: false`, you'll need to handle that map's restart yourself — a cron entry matching the `deadline`, restarting only that map's own service, not `steam`.

> [!NOTE]
> The rest of this guide continues with the compose file from [step 2](#2-update-the-compose-file), not whatever you ended up with after step 6. What you set up here doesn't change anything about how auto-start, updating, or backups work.
>
> Each service's name (`livonia`) and the directory it lives in (`~/servers/livonia`) are just labels — ServerZ doesn't care what either is called, but step 7 onward propagates that service name into the container name, the systemd unit filename, and every command you'll run against it. If you swap Livonia for a different map later, renaming both now, before step 7 generates anything, is cheaper than untangling the mismatch later.

### 7. Auto-start on boot with `podman-compose systemd`

This step will bring all three services back after a reboot as a single managed unit.

From the `~/servers` directory, register the project with systemd:

```bash
cd ~/servers
podman-compose systemd -a register
```

Then stop the compose-managed containers and hand control to systemd:

```bash
podman-compose down
systemctl --user daemon-reload
systemctl --user enable --now 'podman-compose@servers'
```

#### Managing the servers going forward

The `podman-compose@servers` unit manages the entire stack — `steam`, `chernarus`, and `livonia` — as a single unit:

```bash
systemctl --user status 'podman-compose@servers'   # check status
journalctl --user -xeu 'podman-compose@servers'    # logs for the whole stack
systemctl --user restart 'podman-compose@servers'  # restart everything
systemctl --user stop 'podman-compose@servers'     # stop everything
```

For individual service operations — restarting just one map after a config change, or following a specific map's logs — use `podman-compose` commands from the project directory:

```bash
cd ~/servers
podman-compose restart livonia          # restart just Livonia
podman-compose logs -f chernarus        # follow Chernarus logs
podman-compose logs -f steam            # follow Steam daemon logs
```

Reboot the host and confirm the servers come back on their own:

```bash
sudo reboot
# after it comes back up:
ssh dayz@your-server
systemctl --user status 'podman-compose@servers'
```

#### Picking up compose file changes

The unit calls `podman-compose up --no-start` fresh on every start, so the next restart picks up the current `compose.yml` automatically:

```bash
systemctl --user restart 'podman-compose@servers'
```

### 8. Updating the servers

Each map's own container re-validates against Steam on every restart, unconditionally — there's no separate "check for updates first" step, and this is the same on `remote` mode as it is running locally; `steam` just holds the actual session and does the downloading on a map's behalf. If nothing's changed since the last run, that's just fast validation, not a download. If DayZ shipped an update, you'll get a real download, and how long that takes depends on your connection, not anything ServerZ controls.

```bash
systemctl --user restart 'podman-compose@servers'
```

Or, to restart just one map without touching the others or the steam daemon:

```bash
cd ~/servers
podman-compose restart chernarus
```

Watch the logs during an update to confirm it downloads cleanly before players try to connect:

```bash
cd ~/servers
podman-compose logs -f steam
```

A major DayZ update is a good opportunity to give each map's `overrides` a second look — they're copies of files from a specific point in time, and an update can change the file they're copied from out from under them. Since `_install` is shared, this is worth checking once per map, not once total: each map's `overrides` mirrors a different subset of `_install`, and an update can affect any of them independently.

```bash
diff ~/servers/chernarus/overrides/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml \
     ~/servers/_install/223350/mpmissions/dayzOffline.chernarusplus/db/types.xml
```

Lines starting with `<` are unique to your override, `>` are unique to the freshly-updated original — anything only on the `>` side is new or changed upstream that your override doesn't have.

### 9. Backups

Your save state lives in each map's `data` directory (this is the OverlayFS upper layer — thin by design, since it only contains the delta from the base install), and any config customizations you've made live in `overrides`. A simple cron-based backup of both as the `dayz` user.

First, create somewhere for the backups to actually land:

```bash
mkdir -p ~/backups
```

Then schedule the backup itself, one line per map:

```bash
crontab -e
```

```cron
0 4 * * * tar -czf /home/dayz/backups/chernarus-$(date +\%F).tar.gz -C /home/dayz/servers/chernarus data overrides
0 4 * * * tar -czf /home/dayz/backups/livonia-$(date +\%F).tar.gz -C /home/dayz/servers/livonia data overrides
```

Consider syncing the `backups` directory off-host (e.g. to object storage) so a disk failure doesn't take your backups with it. You don't need to back up `_install` or `_steam` — they're Steam-managed and can be re-downloaded.

#### Restoring from a backup

This covers restoring a map onto the same host the backup came from — pulling a backup down from wherever you sent it off-host is on you, same as getting it there in the first place; the mechanics depend on where you put it.

Stop the map's service first, so nothing's writing to `data` while you're replacing it — you don't need to stop `steam` or the other maps:

```bash
cd ~/servers
podman-compose stop chernarus
```

Move the existing `data` and `overrides` aside rather than deleting them outright — if anything about the restore goes wrong, you still have them to fall back to. A fresh, empty destination also matters: a plain extraction only adds and overwrites files, it doesn't remove anything that's not in the backup, so extracting into the existing directories would leave stale or corrupted files behind from after the backup was taken.

```bash
cd ~/servers/chernarus
mv data data.old
mv overrides overrides.old
mkdir -p data overrides
```

Pick the backup you want and extract it:

```bash
tar -xzf ~/backups/chernarus-2026-06-28.tar.gz
```

Then bring the service back up and confirm everything actually came back correctly — connect to the server, check that the state and any customizations you expected are there:

```bash
cd ~/servers
podman-compose start chernarus
```

Once you've confirmed the restore worked, clean up the old copies:

```bash
rm -rf ~/servers/chernarus/data.old ~/servers/chernarus/overrides.old
```

## Troubleshooting

- **Server doesn't show up in the in-game browser:** double-check both the game port and query port are open and forwarded (UDP, not TCP), and that `SERVER_NAME` is set.
- **Container restarts in a loop:** check logs with `journalctl --user -xeu 'podman-compose@chernarus'` (single server) or `journalctl --user -xeu 'podman-compose@servers'` (multi-server) — this is almost always either a Steam download/auth failure or a bad `overrides` file.
- **Stuck waiting on a QR code:** if you didn't catch it in time or the container restarted before you scanned it, check the logs again for a fresh QR challenge. On a single server that's `journalctl --user -xeu 'podman-compose@chernarus'`; on a multi-container setup follow the steam service specifically: `cd ~/servers && podman-compose logs -f steam`.
- **Steam download is slow or fails:** confirm `install`/`_install` and `steam`/`_steam` have enough free disk space; the initial DayZ server download is several GB.
- **Changes to `overrides` aren't taking effect:** the path under `overrides` has to exactly mirror the path under `install` (or the shared `_install`) — double check for typos, then restart the relevant service to pick up the change. Single server: `systemctl --user restart 'podman-compose@chernarus'`. Multi-server for just one map: `cd ~/servers && podman-compose restart chernarus`.
- **Changes to `compose.yml` aren't taking effect:** restart the service — `systemctl --user restart 'podman-compose@chernarus'` (single server) or `systemctl --user restart 'podman-compose@servers'` (multi-server). The unit picks up the current compose file fresh on every start.

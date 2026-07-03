# ServerZ changelog

## [2.0.0] — 2026-07-03

### Highlights

- Added OverlayFS-based persistence with separate install, overrides, generated config, and data layers.
- Added first-class rootless Podman support.
- Replaced SteamCMD subprocess usage with a native Bun/TypeScript Steam depot client.
- Added remote Steam download support through depot-daemon.
- Added schema-driven configuration and generated environment-variable docs.
- Added generated TSX templates for server config files.
- Added GitLab CI for checks, image publishing, and GitHub mirroring.
- Added extensive new operator documentation, including rootless Podman tutorials and tested community maps.

### Breaking / migration-impacting changes

- Runtime moved from Node/npm build output to Bun source execution.
  - Old: `node dist/index.js`
  - New: `bun src/index.ts`
- package-lock.json was replaced by bun.lock.
- SteamCMD adapter code was removed.
- Default persistent layout changed:
  - old style centered around /dayz and /profiles
  - new style uses:
    - `/install`
    - `/overrides`
    - `/data`
    - `/root/.steam`
    - generated merged runtime path under `/dayz/${APP_ID}`
- MOD_LIST is now documented/handled as a JSON array string.
  - Example: `"[1559212036,1828439124]"`
- Steam query port default moved to `27015`.
- `COPY_MISSION` is deprecated. OverlayFS now handles persistence for mission edits.
- Config is now schema-driven; manual edits to generated config docs/templates should be avoided.

### Steam / depot downloads

- Added native depot-client integration for app and workshop downloads.
- Added QR login support as the recommended Steam auth path.
- Added saved credential reuse under `/root/.steam`.
- Added Steam download profiles:
  - `safe`
  - `medium`
  - `fast`
- Added native CDN chunk download path with configurable concurrency/compression/validation tuning.
- Added validation/repair controls for downloaded and existing files.
- Added support for Steam CM connection protocol selection:
  - `auto`
  - `tcp`
  - `websocket`
- Added remote adapter mode:
  - `STEAM_API_ADAPTER=local` (default)
  - `STEAM_API_ADAPTER=remote`
- Remote mode talks to depot-daemon, defaulting to UDS:
  - `/root/.steam/depot.sock`

### Remote depot-daemon support

- Added shared daemon API contract vendored from depot-daemon.
- Added UDS [Socket.IO](http://socket.io/) client support through Bun Unix-socket fetch.
- Added remote Steam custom method registration fix.
- Added remote content locks:
  - ServerZ registers locks after update/prep and before launching DayZ.
  - Locks are semantic:
    - `app:${appId}`
    - `workshop:${appId}:${workshopId}`
  - Heartbeats keep locks alive while DayZ runs.
  - Locks are released on graceful shutdown/child exit.
  - Missed heartbeats expire by TTL.
- Added remote validation policy:
  - `STEAM_REMOTE_VALIDATION_FAILURE=warn|fail`
  - default: `warn`

### Persistence / filesystem

- Added OverlayFS runtime composition:
  - `INSTALL_DIRECTORY`
  - `OVERRIDES_DIRECTORY`
  - `GENERATED_CONFIG_DIRECTORY`
  - `DATA_DIRECTORY`
  - `SERVER_DIRECTORY`
- Added fallback copy mode.
- Added best-effort copy-mode persistence on graceful shutdown.
- Added centralized shutdown handling:
  - `SIGTERM`
  - `SIGINT`
  - DayZ child exit
  - fatal process paths
- Added configurable shutdown timeout:
  - `SHUTDOWN_TIMEOUT_MS`
- Added wipe flow:
  - `WIPE`
  - `WIPE_INSTALL`
  - `WIPE_TIMEOUT`

### Config generation / templates

- Added TypeBox schema-driven config under src/config/schema.ts.
- Added config resolver for dynamic defaults.
- Added generated artifacts:
  - `config/default.json`
  - `config/custom-environment-variables.json`
  - `src/config.generated.d.ts`
  - `doc/environment_variables.md`
  - `doc/steam_environment_variables.md`
- Added check:config-docs CI guard.
- Replaced string-built server config generation with TSX templates under `templates/`.
- Added generated templates for:
  - `serverDZ.generated.cfg`
  - BattlEye config
  - whitelist
  - priority list
  - ban list

### Container / runtime

- Dockerfile now uses oven/bun:1.3.14-debian.
- Added separate image targets:
  - `rootful`
  - `rootless`
- Rootless target uses `unshare --user --map-root-user --mount`.
- Runtime directories now created for:
  - `/serverz`
  - `/dayz`
  - `/install`
  - `/overrides`
  - `/data`
  - `/root/.steam`

### CI / publishing

- Added GitLab CI with stages:
  - `check`
  - `image`
  - `mirror`
- CI check stage runs:
  - `bun install --frozen-lockfile`
  - `bun run check:config-docs`
  - `bun run check:licenses`
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test`
- Image publishing builds rootful/rootless images.
- Beta branch publishes beta image tags.
- Tags publish versioned/latest image tags.

### Tooling / quality

- Added oxlint config.
- Added Prettier config.
- Added TypeScript project updates.
- Added license checks using `license-checker-rseidelsohn`.
- Added config resolution tests.
- Added Bun-first scripts:
  - `bun run start`
  - `bun run dev`
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test`
  - `bun run gen:config-docs`
  - `bun run check:config-docs`
  - `bun run check:licenses`

### Documentation

- Reworked README with:
  - banner
  - badges
  - updated usage
  - rootless Podman guidance
  - QR login docs
  - OverlayFS/persistence explanation
  - updated port and volume examples
  - map/mod setup notes
- Added `CONTRIBUTING.md`.
- Added `CHANGELOG.md` (👋).
- Added rootless Podman tutorial:
  - `doc/linux_podman_tutorial.md`
- Added quick start guide:
  - `doc/quick_start_guide_podman.md`
- Added tested map documentation:
  - `doc/tested_maps.md`
- Added dedicated Steam environment variable docs:
  - `doc/steam_environment_variables.md`

### Maps / operator behavior

- Added tested map matrix/documentation for many community maps.
- Added clearer handling of Git/zip/workshop map sources.
- Added mod-relative path support for map/mission references.
- Added `CLEAN_MODS` behavior documentation and safer dangling symlink cleanup.
- Added examples for shared install with multiple ServerZ containers and a central depot-daemon.

### Fixes

- Fixed Steam validation stomping on operator edits to base game files. Fixes #1, #4.
- Fixed ServerZ boot-loop behavior when server start is disabled.
- Fixed boolean parser handling through `NODE_CONFIG_PARSER`.
- Fixed README GitHub mirror behavior after banner/badges were added.
- Fixed map docs/status updates, including Newyork and Lux.
- Improved shutdown/copy-mode persistence behavior.
- Improved logging/scrubbing path for sensitive config values.

# Contributing to ServerZ

## Where this actually lives

The GitLab instance at [gitlab.godbleak.dev/godbleak/serverz](https://gitlab.godbleak.dev/godbleak/serverz) is the primary repository. GitHub is a one-way mirror — every push to `main` force-pushes over it. Please open issues and merge requests on GitLab.

## Getting set up

You'll need [Bun](https://bun.sh). CI currently runs on Bun `1.3.14`; anything close to that should work. For container testing, use [Podman](https://podman.io/) and [podman-compose](https://github.com/containers/podman-compose).

```bash
git clone https://gitlab.godbleak.dev/godbleak/serverz.git
cd serverz
bun install
bun run dev # starts with file watching; needs real env vars / a Steam login to do anything useful
```

Most config, template, and docs changes can be reviewed without actually starting a DayZ server. See the relevant sections below.

## Whitelist any new root files and/or directories

ServerZ's `.gitignore` is a whitelist, not a blacklist. This was chosen specifically so you can pollute your local checkout with whatever temporary files you may need, without worrying about accidentally committing them or leaving traces of them in `.gitignore`.

If you add a real root-level file or directory, explicitly whitelist it in `.gitignore`.

## Before you open a merge request

### Test with rootless Podman

> [!NOTE]
> You can skip this step if your changes are purely documentation-related.

Rootless Podman is a first-class deployment target. If your change touches startup, filesystem behavior, Steam downloads, mods, generated config, health checks, process lifecycle, or Dockerfile behavior, test the rootless image.

#### Build the image

```bash
podman build --target rootless -t registry.godbleak.dev/godbleak/serverz:rootless .
```

#### Run the image

```yaml
services:
  serverz:
    image: registry.godbleak.dev/godbleak/serverz:rootless
    restart: unless-stopped
    stop_grace_period: 2m
    volumes:
      - "/path/to/persistent/data:/data"
      - "/path/to/persistent/overrides:/overrides"
      - "/path/to/persistent/install:/install"
      - "/path/to/persistent/steam:/root/.steam"
    ports:
      - 2302:2302/udp
      - 27015:27015/udp
```

If you made configuration changes, add the relevant environment variables to the service so you are testing the actual behavior you changed.

#### Join the server

Don't just watch for clean startup logs. While other gates like `check:config-docs` and `typecheck` can confirm your changes produce a well-formed config file, joining the server confirms DayZ reads that file how we'd expect, or that our changes didn't break connectivity.

- **Config or generated template changes:** the file rendering correctly tells us the schema and template agree with each other. It doesn't tell us DayZ agrees with both of them. Change the relevant value away from its default and confirm it took effect in-game (a server name, a gameplay setting, an admin permission) rather than just in the generated file.
- **Port, networking, or startup sequencing changes:** a clean build and a clean log mean the container is happy. They don't mean a player can actually reach it. Connect from outside the container on the mapped ports and confirm.
- **Anything else:** join the server and confirm the behavior you changed, the way a player or operator would see it, not just that the container is still running.

If a change genuinely can't be verified this way — internal refactoring with no observable behavior change, say — note that in the merge request rather than skipping this quietly.

### CI

CI runs a single `check` stage, and it is exactly this:

```bash
bun install --frozen-lockfile
bun run check:config-docs
bun run check:licenses
bun run lint
bun run typecheck
bun run test
```

Running it yourself before opening a merge request saves a round trip.

Useful non-check commands while working:

```bash
bun run lint:fix          # applies only fixes oxlint considers safe
bun run lint:suggestions  # applies fixes oxlint is fairly confident in, but not certain of — review the diff
bun run gen:config-docs
```

Formatting is handled by Prettier through `.prettierrc.json`, but CI does not currently enforce it — there's no formatting check in the `check` stage above. Use editor format-on-save, or run it yourself before committing:

```bash
bunx prettier --write .
```

## Changing configuration options

Config is schema-first. To add, rename, or change the behavior of an environment variable:

1. Edit the relevant schema in `src/config/schema.ts` or the Steam-specific schema it composes in. A typical entry looks like:

```ts
copyMission: Type.Optional(
  Type.Boolean({
    env: "COPY_MISSION",
    defaultDoc: "undefined",
    description: "...",
    deprecated: true, // omit entirely for a non-deprecated option
  })
)
```

2. Treat the schema description as documentation. Those descriptions become the generated environment-variable tables.
3. Update resolver/normalization logic if the option has a dynamic default or derives from another option.
4. Run:

```bash
bun run gen:config-docs
```

This regenerates:

```text
doc/environment_variables.md
doc/steam_environment_variables.md
config/default.json
config/custom-environment-variables.json
src/config.generated.d.ts
```

Do not hand-edit generated regions in the docs. They are delimited by markers like:

```html
<!-- env-doc:*:start -->
<!-- env-doc:*:end -->
```

`check:config-docs` will fail if committed docs/config/types do not match the schema output. Prose outside generated regions is fair game.

If you are deprecating an option rather than removing it, follow the existing pattern: keep it accepted, warn loudly on use, and point users to the README's Issues section if the replacement does not cover their case.

### Path defaults

Many path defaults derive from another configured path. Do not hand-roll one-off path logic.

Use the existing resolver behavior in `src/config/resolver.ts`, especially:

```ts
useProvidedOrDefaultPathFactory()
normalizeDefaultPath()
```

The expected behavior is generally:

- if the current value still matches the default, resolve it under the configured parent path
- if the user supplied a custom value, preserve it

## Changing generated server config files

`serverDZ.cfg`, BattlEye config, and ban/whitelist/priority files are not string-concatenated templates. They are `.tsx` files under `templates/`, rendered through ServerZ's small JSX runtime.

Yes, TSX. No, I'm not going to consider \<your preferred templating language here\>, unless it also supports TypeScript's types.

Look here:

```text
templates/generated/
templates/data/
templates/_utilities.tsx
```

If you are changing what gets written into one of those files, this is the place to work — not a `.cfg.template` file.

The top-level folder name under `templates/` is not just organization — `applyTemplates()` in `src/server.ts` maps it directly to an overlay layer of the same name and renders everything inside it into that layer:

```text
templates/install/      -> INSTALL_DIRECTORY
templates/overrides/    -> OVERRIDES_DIRECTORY
templates/generated/    -> GENERATED_CONFIG_DIRECTORY  (currently used)
templates/data/         -> DATA_DIRECTORY               (currently used)
```

Only `generated/` and `data/` currently exist, but `install/` and `overrides/` are equally valid destinations if you add a template that belongs in one of those layers instead. Adding a new template means picking the right folder for the layer you want, not just a free choice of where to put a new file.

## Steam API modes

ServerZ supports two Steam API modes:

```text
local   ServerZ owns the Steam client/session and download config.
remote  depot-daemon owns the Steam client/session and daemon-side download config.
```

Important boundaries:

- Local mode uses ServerZ's Steam config — but still runs `depot-client`, vendored from `depot-daemon`, just in-process rather than over a socket. See [Vendored from depot-daemon](#vendored-from-depot-daemon-dont-edit-these-directly) below.
- Remote mode delegates session, QR login UX, install directories, validation policy, backend, compression, and concurrency to depot-daemon.
- Remote ServerZ should not render QR codes. The daemon owns Steam login UX.
- Remote clients should only send branch credentials per request (`branch`, `branchPassword`). This is deliberate, not an oversight: daemon-owned tuning (directories, download backend, concurrency, validation policy, compression) comes from the daemon's own config, not from whatever a remote caller sends — a remote ServerZ instance shouldn't be able to override another operator's daemon settings by what it puts in a request.
- The supported remote transport is UDS.
- Canonical daemon socket path is `/root/.steam/depot.sock`.

When testing your own changes, default to `local` unless your change specifically touches `remote`-only code (the socket transport, `RemoteSteamAPI`, or daemon-side behavior). Which mode to run in production is an operator decision, covered in the README, not here.

## Vendored from depot-daemon — don't edit these directly

Two directories are pulled in via Git subtree from a sibling `depot-daemon` project, not authored directly in this checkout:

```text
src/lib/steamapi/depot-client    the Steam depot/CDN client itself — what `local` mode actually runs
src/lib/depot-daemon-shared      the schema/API contract shared between ServerZ and a running daemon
```

> [!NOTE]
> The `local` adapter runs `depot-client` in-process, so its _code_ comes from `depot-daemon` either way — see [Steam API modes](#steam-api-modes) above. What you don't need a sibling clone for is day-to-day contribution: it's only required if you're changing either vendored directory yourself, or testing against a _running_ `remote` daemon.

If you do need it, clone [depot-daemon](https://gitlab.godbleak.dev/GodBleak/depot-daemon) as a sibling directory to `serverz` — the subtree tooling expects it at `../depot-daemon` relative to this checkout:

```bash
cd ..
git clone https://gitlab.godbleak.dev/GodBleak/depot-daemon.git
cd serverz
```

See `src/lib/depot-daemon-shared/VENDORED_FROM.md` for the exact file list of the shared boundary.

If you need to change something in either vendored directory:

1. Make the change in the upstream `depot-daemon` repo — `src/depot-client` or `src/shared`, matching whichever you're touching.
2. Refresh the split branches in `depot-daemon`:

```bash
bun run update:subtree-splits
```

3. Pull it into ServerZ with:

```bash
bun run update:depot-daemon-subtrees
```

The update script:

- ensures a local `depot-daemon` remote exists
- fetches `depot-client-split` and `depot-daemon-shared-split`
- pulls both subtrees with `--squash`
- reapplies ServerZ compatibility edits

Compatibility edits currently include:

```text
@feathersjs/typebox -> @sinclair/typebox
../depot-client/index.js -> ../steamapi/depot-client/src/index.js
```

Review the diff after subtree pulls. Subtree commits can look noisy; make sure the compatibility edits are still intentional.

## Persistence, overlayfs, and copy mode

ServerZ composes runtime files from several paths:

```text
INSTALL_DIRECTORY              base downloaded server/mod files
DATA_DIRECTORY                 persistent runtime writes
OVERRIDES_DIRECTORY            operator-managed override files
GENERATED_CONFIG_DIRECTORY     generated config/templates
SERVER_DIRECTORY               mounted/copied merged view used to run DayZ
```

Overlay mode should keep `DATA_DIRECTORY` as the upper/write layer. Copy mode is a fallback and does not promise the same thin-data semantics as overlayfs.

When changing overlay/copy behavior:

- Preserve layer precedence: install < overrides < generated < data. `DATA_DIRECTORY` is the upper layer and always wins, full stop; among the lower layers, generated wins over overrides, which wins over install (`lowerdir` in `overlay.ts` is highest-priority first: `generated:overrides:install`).
- Avoid interrupting filesystem operations during reload.
- Make shutdown behavior explicit for SIGTERM/SIGINT and child exit paths.
- Remember that SIGKILL, OOM kill, host crash, and power loss cannot run JS cleanup.

## Mods and workshop layout

To install mods, users set `MOD_LIST`. ServerZ then downloads workshop items, creates server-friendly `@mod` paths, links keys, and adds the mods to launch parameters.

Be careful with changes around:

```text
MOD_PATH
MOD_LIST
createModSymlink()
createModKeyLinks()
cleanMods()
```

Validate behavior across:

- fresh install
- restart after successful install
- interrupted mod download
- missing/broken symlink
- a mod removed from `MOD_LIST` after a previous install (`cleanMods()`'s dangling-symlink path)
- a mod-list change while the server is already running — `loadMods()` reloads the overlay twice (after symlinking, after key-linking); make sure a second change can't race a reload still in flight
- rootless container
- remote depot-daemon mode

## Adding a tested map

`doc/tested_maps.md` only earns its keep if it stays honest, so a new entry needs to reflect an actual test, not "this should work."

The convention for each entry:

1. Add a line to the `## Maps` index list pointing at the section anchor you are about to create.
2. Add a `### [Map Name](link-to-map) ✅` or `❌` section, with a `Tested on DD-MM-YYYY` shields.io badge underneath the heading. If ServerZ couldn't even acquire the map's files to attempt a test — an unsupported package format, for example — use a `Failed to Test on DD-MM-YYYY` badge instead, and say why. "Tested... ❌" and "Failed to Test... ❌" are different claims: one means the map was tried and didn't work, the other means there was nothing to try.
3. If anything needed a workaround — mod load order, overriding `meta.cpp`, a non-default `MISSION_PATH`/`TEMPLATE` — write it out like the existing entries, including exact commands where useful.
4. Test with rootless Podman, load DayZ, connect to the server, verify the map loaded correctly, and move your character around.
5. Include the final compose service definition you tested with. Community Framework is assumed as a baseline for every map and does not need to be called out separately.
6. Wipe between tests with the `WIPE` option rather than reusing state from a previous map.

A ❌ does not have to mean "don't bother." If a map only fails because of something outside ServerZ's philosophy — for example, it requires patching its own files in a way that would not survive an update — say so and link to whatever the map maintainer provides.

## Logging and errors

Logs should make operator action obvious. Prefer messages that name:

```text
operation
path
app/depot/workshop id
configured env var involved
probable remediation
```

Avoid swallowing low-level errors needed for diagnosis. When wrapping errors, preserve the cause.

Sensitive values must not be logged. Register them as secrets (`logger.registerSecret`, see `src/config/index.ts`) so they're scrubbed from the debug config dump:

```text
Steam passwords
Steam Guard codes
server / admin / BattlEye passwords
branch passwords
refresh/access tokens
registry/API tokens
```

## Dependencies and licensing

All dependencies must be MIT-compatible. `check:licenses` only fails the build on GPL/AGPL/SSPL and their variants — it's a backstop for the worst case, not a guarantee of MIT-compatibility on its own. The actual test is whether the dependency's license lets ServerZ remain MIT licensed; `license:summary` prints what's actually in the dependency tree so you can check anything you're not already sure of.

If you are adding a dependency, check its license before opening the MR:

```bash
bun run license:summary
bun run check:licenses
```

## Image publishing and GitHub mirror

GitLab is canonical.

CI publishes images from `beta` and tags. For `main`, CI also force-pushes the GitHub mirror. Do not treat GitHub as the source of truth, and do not open MRs there.

The mirror job also rewrites `readme.md` on its way out, inserting a "this is a mirror" notice right after the `# ServerZ` heading before pushing. That's why the canonical `readme.md` in this repo never has that notice — don't add it by hand, the CI job expects the file to start with a bare `# ServerZ` heading and will misbehave if it doesn't.

Do not force-push public branches/tags unless explicitly coordinated.

## License

ServerZ is MIT licensed. See `LICENSE`. By contributing, you agree your contribution is provided under the same license.

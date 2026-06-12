# Steam Environment Variables

These variables come from the native Steam depot client integration copied from `depot-client`. This document is for Steam download/client tuning only. Authentication/session variables stay in `environment_variables.md` with the other primary ServerZ environment variables.

## Recommended profile model

Use profiles as named presets, then apply explicit environment variables as overrides.

```ts
const appProfile = resolveDownloadProfile(process.env.STEAM_APP_DOWNLOAD_PROFILE, "fast")
const workshopProfile = resolveDownloadProfile(process.env.STEAM_WORKSHOP_DOWNLOAD_PROFILE, appProfile)

const downloadProfiles = {
  app: {
    safe: {
      downloadBackend: "bun-cdn",
      maxConcurrentChunks: 8,
      maxConcurrentDepots: 1,
      maxConcurrentFiles: 2,
      maxOpenFileHandles: 32,
      verifyDownloaded: "full-file",
      verifyExisting: true,
      repairInvalidFiles: true,
      maxValidationRepairAttempts: 2,
      bunCdnFallbackToSteamUser: true,
      bunCdnFetchTimeoutMs: 30_000,
    },
    medium: {
      downloadBackend: "bun-cdn",
      maxConcurrentChunks: 16,
      maxConcurrentDepots: 2,
      maxConcurrentFiles: 4,
      maxOpenFileHandles: 64,
      verifyDownloaded: "full-file",
      repairInvalidFiles: true,
      maxValidationRepairAttempts: 1,
      bunCdnFetchTimeoutMs: 15_000,
    },
    fast: {
      downloadBackend: "bun-cdn",
      maxConcurrentChunks: 32,
      maxConcurrentDepots: 3,
      maxConcurrentFiles: 6,
      maxOpenFileHandles: 128,
      verifyDownloaded: "chunks-only",
      repairInvalidFiles: false,
      bunCdnFetchTimeoutMs: 15_000,
    },
  },
  workshop: {
    safe: {
      downloadBackend: "bun-cdn",
      maxConcurrentChunks: 8,
      maxConcurrentDepots: 1,
      verifyDownloaded: "full-file",
      includeChildren: true,
      separateItemDirectories: true,
      workshopCycleMode: "skip",
      bunCdnFallbackToSteamUser: true,
    },
    medium: {
      downloadBackend: "bun-cdn",
      maxConcurrentChunks: 16,
      maxConcurrentDepots: 2,
      verifyDownloaded: "full-file",
      includeChildren: true,
      separateItemDirectories: true,
      workshopCycleMode: "skip",
    },
    fast: {
      downloadBackend: "bun-cdn",
      maxConcurrentChunks: 32,
      maxConcurrentDepots: 3,
      verifyDownloaded: "chunks-only",
      includeChildren: true,
      separateItemDirectories: true,
      workshopCycleMode: "skip",
    },
  },
} as const
```

<!-- env-doc:steam:start -->

| Variable                               | Default             | Description                                                                                                                 |
| -------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `STEAM_APP_ID`                         | `{APP_ID}`          | The Steam App ID for DayZ Server                                                                                            |
| `STEAM_APP_DOWNLOAD_PROFILE`           | `fast`              | Download profile for Steam app/server files                                                                                 |
| `STEAM_WORKSHOP_DOWNLOAD_PROFILE`      | `fast`              | Download profile for Steam workshop items                                                                                   |
| `STEAM_DOWNLOAD_DIRECTORY`             | `INSTALL_DIRECTORY` | The directory where the server is installed. This should be bind-mounted to a persistent directory on the host.             |
| `STEAM_CONFIG_DIRECTORY`               | `/root/.steam`      | The directory where the Steam configuration is stored. Defaults to the value of `/root/.steam`.                             |
| `STEAM_BRANCH`                         | `public`            | The branch/beta name.                                                                                                       |
| `STEAM_BRANCH_PASSWORD`                | `undefined`         | Password for protected branches.                                                                                            |
| `STEAM_OS`                             | `undefined`         | Platform filter passed to depot resolution.                                                                                 |
| `STEAM_ARCH`                           | `undefined`         | Architecture filter passed to depot resolution.                                                                             |
| `STEAM_LANGUAGE`                       | `english`           | Language filter passed to depot resolution.                                                                                 |
| `STEAM_WORKSHOP_INCLUDE_CHILDREN`      | `true`              | Include child/dependency workshop items.                                                                                    |
| `STEAM_WORKSHOP_SEPARATE_ITEM_DIRS`    | `true`              | Keep each workshop item in a separate directory.                                                                            |
| `STEAM_WORKSHOP_CYCLE_MODE`            | `skip`              | Behavior when workshop dependencies contain cycles.                                                                         |
| `STEAM_DOWNLOAD_BACKEND`               | `bun-cdn`           | Download backend. `bun-cdn` is the native fast path.                                                                        |
| `STEAM_MAX_CONCURRENT_CHUNKS`          | `32`                | Max concurrent chunks per depot for `bun-cdn`/`managed-chunks`.                                                             |
| `STEAM_MAX_CONCURRENT_DEPOTS`          | `3`                 | Max depots processed concurrently.                                                                                          |
| `STEAM_MAX_CONCURRENT_FILES`           | `6`                 | Max files for `steam-user-file` backend; less relevant for `bun-cdn`.                                                       |
| `STEAM_MAX_OPEN_FILE_HANDLES`          | `64`                | Max simultaneously open output file handles for managed chunk writing.                                                      |
| `STEAM_BUN_CDN_FETCH_TIMEOUT_MS`       | `15000`             | Per-attempt CDN fetch timeout for `bun-cdn`.                                                                                |
| `STEAM_BUN_CDN_FALLBACK`               | `false`             | Fall back to `steam-user.downloadChunk()` when the native CDN chunk path fails.                                             |
| `STEAM_PROGRESS_INTERVAL_MS`           | `500`               | Minimum interval between emitted progress events from the depot client.                                                     |
| `STEAM_PROGRESS_PRINT_INTERVAL_MS`     | `1000`              | Example stdout throttling. Not needed unless ServerZ has console progress rendering.                                        |
| `STEAM_VERIFY_DOWNLOADED`              | `full-file`         | Verification policy for freshly downloaded files/chunks. `full-file` is safest; `chunks-only` avoids final full-file reads. |
| `STEAM_VERIFY_EXISTING`                | `true`              | Hash existing matching files before skipping.                                                                               |
| `STEAM_REPAIR_INVALID_FILES`           | `true`              | Redownload missing/corrupt files found by validation.                                                                       |
| `STEAM_MAX_VALIDATION_REPAIR_ATTEMPTS` | `1`                 | Number of repair passes after validation failure.                                                                           |
| `STEAM_VALIDATE_CONCURRENT_FILES`      | `8`                 | Validation-only file concurrency in example validator.                                                                      |
| `STEAM_VALIDATE_HASHES`                | `true`              | Validation-only hash checking in example validator.                                                                         |
| `STEAM_CDN_COMPRESSION`                | `auto`              | Compression strategy for `bun-cdn`.                                                                                         |
| `STEAM_CDN_ZSTD_BACKEND`               | `auto`              | Zstd backend for VSZa chunks.                                                                                               |
| `STEAM_CDN_LZMA_BACKEND`               | `auto`              | LZMA/VZip backend. `auto` prefers process-isolated ffi-liblzma under Bun when available.                                    |
| `STEAM_BUN_EXECUTABLE`                 | `undefined`         | Bun executable used by process-isolated ffi-liblzma workers, especially when main process is not Bun.                       |
| `STEAM_FFI_LZMA_WORKERS`               | `undefined`         | Process/worker count for ffi-liblzma decompression.                                                                         |
| `STEAM_FFI_LZMA_PROCESS_RETRIES`       | `2`                 | Retry count for process-isolated ffi-liblzma jobs after worker crashes.                                                     |
| `STEAM_FFI_LZMA_LIBRARY_PATH`          | `undefined`         | Explicit path to `libsteam_lzma`.                                                                                           |
| `STEAM_FFI_LZMA_MEMLIMIT_BYTES`        | `undefined`         | liblzma memory limit. Raise if VZip decompression reports memory-limit failures.                                            |
| `STEAM_NODE_EXECUTABLE`                | `node`              | Node executable used by the Node/lzma-native worker backend. Mostly irrelevant under Bun unless that backend is selected.   |
| `STEAM_LZMA_NATIVE_REQUIRE_PATH`       | `lzma-native`       | Require path used inside Node lzma-native workers. Internal/advanced.                                                       |

<!-- env-doc:steam:end -->

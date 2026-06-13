import { test, expect, describe } from "bun:test"
import { DEFAULTS as _DEFAULTS } from "./defaults"
import { resolveConfig } from "../../src/config/resolver"
import { type ServerZSchema } from "../../src/config/schema"

const DEFAULTS = () => structuredClone(_DEFAULTS) as typeof _DEFAULTS

const APP_IDS = [223350, 1042420] as const
const MOD_APP_IDS = [221100, 1024020] as const
const MISSIONS = ["dayzOffline.chernarusplus", "dayzOffline.enoch"] as const

const LAYER_PATHS = {
  INSTALL_DIRECTORY: {
    key: "installDirectory",
    path: "/install/",
  },
  OVERRIDES_DIRECTORY: {
    key: "overridesDirectory",
    path: "/overrides/",
  },
  GENERATED_CONFIG_DIRECTORY: {
    key: "generatedConfigDirectory",
    path: "/tmp/serverz/dayz/",
  },
  DATA_DIRECTORY: {
    key: "dataDirectory",
    path: "/data/",
  },
  SERVER_DIRECTORY: {
    key: "serverDirectory",
    path: "/dayz/",
  },
} as const

describe("Layer directories resolve correctly", () => {
  for (const pathKey in LAYER_PATHS) {
    const { key, path } = LAYER_PATHS[pathKey as keyof typeof LAYER_PATHS]
    test(`default ${pathKey} becomes ${path}\${APP_ID}`, () => {
      for (const appID of APP_IDS) {
        const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, appID: appID } }
        const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
        expect(resolved.meta[key]).toBe(`${path}${appID}`)
      }
    })

    test(`custom ${pathKey} remains /custom`, () => {
      const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, [key]: "/custom" } }
      const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
      expect(resolved.meta[key]).toBe("/custom")
    })
  }
})

describe("OVERLAY_FS_SCRATCH_DIRECTORY resolves correctly", () => {
  test("default OVERLAY_FS_SCRATCH_DIRECTORY with default DATA_DIRECTORY becomes /data/.overlay-work", () => {
    for (const appID of APP_IDS) {
      const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, appID: appID } }
      const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
      expect(resolved.meta.overlayFSScratchDirectory).toBe(`/data/.overlay-work`)
    }
  })

  test("default OVERLAY_FS_SCRATCH_DIRECTORY with custom DATA_DIRECTORY becomes /custom/.overlay-work", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, dataDirectory: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.overlayFSScratchDirectory).toBe("/custom/.overlay-work")
  })

  test("custom OVERLAY_FS_SCRATCH_DIRECTORY remains /custom", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, overlayFSScratchDirectory: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.overlayFSScratchDirectory).toBe("/custom")
  })
})

describe("PROFILES_PATH resolves correctly", () => {
  test("default PROFILES_PATH with default DATA_DIRECTORY becomes /data/${APP_ID}/profiles", () => {
    for (const appID of APP_IDS) {
      const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, appID: appID } }
      const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
      expect(resolved.meta.profilesPath).toBe(`/data/${appID}/profiles`)
    }
  })

  test("default PROFILES_PATH with custom DATA_DIRECTORY becomes /custom/profiles", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, dataDirectory: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.profilesPath).toBe("/custom/profiles")
  })

  test("custom PROFILES_PATH remains /custom", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, profilesPath: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.profilesPath).toBe("/custom")
  })
})

describe("CONFIG_PATH resolve correctly", () => {
  test("default CONFIG_PATH with default SERVER_DIRECTORY becomes /dayz/${APP_ID}/serverDZ.generated.cfg", () => {
    for (const appID of APP_IDS) {
      const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, appID: appID } }
      const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
      expect(resolved.meta.configPath).toBe(`/dayz/${appID}/serverDZ.generated.cfg`)
    }
  })

  test("default CONFIG_PATH with custom SERVER_DIRECTORY becomes /custom/serverDZ.generated.cfg", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, serverDirectory: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.configPath).toBe("/custom/serverDZ.generated.cfg")
  })

  test("custom CONFIG_PATH remains /custom/serverDZ.custom.cfg", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, configPath: "/custom/serverDZ.custom.cfg" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.configPath).toBe("/custom/serverDZ.custom.cfg")
  })
})

describe("BE_PATH resolve correctly", () => {
  test("default BE_PATH with default GENERATED_CONFIG_DIRECTORY becomes /tmp/serverz/dayz/${APP_ID}/battleye", () => {
    for (const appID of APP_IDS) {
      const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, appID: appID } }
      const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
      expect(resolved.meta.bePath).toBe(`/tmp/serverz/dayz/${appID}/battleye`)
    }
  })

  test("default BE_PATH with custom GENERATED_CONFIG_DIRECTORY becomes /custom/battleye", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, generatedConfigDirectory: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.bePath).toBe("/custom/battleye")
  })

  test("custom BE_PATH remains /custom", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, bePath: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.bePath).toBe("/custom")
  })
})

describe("MOD_PATH resolve correctly", () => {
  test("default MOD_PATH with default INSTALL_DIRECTORY becomes /install/${APP_ID}/steamapps/workshop/content/${MOD_APP_ID}", () => {
    for (const appID of APP_IDS) {
      for (const modAppID of MOD_APP_IDS) {
        const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, appID, modAppID } }
        const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
        expect(resolved.meta.modPath).toBe(`/install/${appID}/steamapps/workshop/content/${modAppID}`)
      }
    }
  })

  test("default MOD_PATH with custom INSTALL_DIRECTORY becomes /custom/steamapps/workshop/content/${MOD_APP_ID}", () => {
    for (const modAppID of MOD_APP_IDS) {
      const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, modAppID, installDirectory: "/custom" } }
      const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
      expect(resolved.meta.modPath).toBe(`/custom/steamapps/workshop/content/${modAppID}`)
    }
  })

  test("custom MOD_PATH remains /custom", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, modPath: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.modPath).toBe("/custom")
  })
})

describe("MAPS_PATH resolve correctly", () => {
  test("default MAPS_PATH with default INSTALL_DIRECTORY becomes /install/${APP_ID}/maps", () => {
    for (const appID of APP_IDS) {
      const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, appID: appID } }
      const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
      expect(resolved.meta.mapsPath).toBe(`/install/${appID}/maps`)
    }
  })

  test("default MAPS_PATH with custom INSTALL_DIRECTORY becomes /custom/maps", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, installDirectory: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.mapsPath).toBe("/custom/maps")
  })

  test("custom MAPS_PATH remains /custom", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, mapsPath: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.mapsPath).toBe("/custom")
  })
})

describe("MISSION_PATH resolves correctly", () => {
  test("default MISSION_PATH with default INSTALL_DIRECTORY becomes /install/${APP_ID}/mpmissions/${TEMPLATE}", () => {
    for (const appID of APP_IDS) {
      for (const mission of MISSIONS) {
        const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, appID }, server: { ...DEFAULTS().server, template: mission } }
        const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
        expect(resolved.meta.missionPath).toBe(`/install/${appID}/mpmissions/${mission}`)
      }
    }
  })

  test("default MISSION_PATH with custom INSTALL_DIRECTORY becomes /custom/mpmissions/${TEMPLATE}", () => {
    for (const mission of MISSIONS) {
      const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, installDirectory: "/custom" }, server: { ...DEFAULTS().server, template: mission } }
      const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
      expect(resolved.meta.missionPath).toBe(`/custom/mpmissions/${mission}`)
    }
  })

  test("custom MISSION_PATH remains /custom", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, missionPath: "/custom" } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.meta.missionPath).toBe("/custom")
  })
})

describe("ENABLE_WHITELIST resolves correctly", () => {
  test("default ENABLE_WHITELIST, when no whitelist, is false", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, whitelist: [] } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.server.enableWhitelist).toBe(false)
  })

  test("ENABLE_WHITELIST remains true when set, and whitelist is empty", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, whitelist: [] }, server: { ...DEFAULTS().server, enableWhitelist: true } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.server.enableWhitelist).toBe(true)
  })

  test("default ENABLE_WHITELIST, with whitelist defined, becomes true", () => {
    const config = { ...DEFAULTS(), meta: { ...DEFAULTS().meta, whitelist: ["1111111111112222222222222333333333XXXXXXAAAA"] } }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.server.enableWhitelist).toBe(true)
  })

  test("ENABLE_WHITELIST remains false when set, and whitelist is populated", () => {
    const config = {
      ...DEFAULTS(),
      meta: { ...DEFAULTS().meta, whitelist: ["1111111111112222222222222333333333XXXXXXAAAA"] },
      server: { ...DEFAULTS().server, enableWhitelist: false },
    }
    const resolved = resolveConfig<ServerZSchema>(config, DEFAULTS())
    expect(resolved.server.enableWhitelist).toBe(false)
  })
})

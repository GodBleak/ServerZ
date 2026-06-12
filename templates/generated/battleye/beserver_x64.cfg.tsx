import type { ServerZGeneratedConfig } from "../../../src/config.generated.js"
import { createSet } from "../../_utilities.js"

const Set = createSet(" ");

export async function generate(config: ServerZGeneratedConfig) {
    const { logger } = await import("../../../src/lib/logger.js")
    try {
        const { overlay } = await import("../../../src/overlay.js")
        const activeConfigRegex = /beserver_x64_active_[0-9a-f]{8}\.cfg/
        const files = await overlay.fs.readdir(config.meta.bePath)
        const activeConfigFiles = files.filter((file) => activeConfigRegex.test(file))

        for (const file of activeConfigFiles) {
            try {
                await overlay.fs.rm(`${config.meta.bePath}/${file}`)
            } catch {
                logger.error(`Failed to remove active BE config file: ${file}`)
            }
        }
    } catch (e) {
        logger.debug(`Failed to remove active BE config files (likely directory does not exist yet): ${e instanceof Error ? e.message : String(e)}`)
    }
    return (
        <>
            <Set name="RConIP" when={config.battleye.ip} />
            <Set name="RConPort" when={config.battleye.port} />
            <Set name="RConPassword" when={config.battleye.password} />
        </>
    )
}

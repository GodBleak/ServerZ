import type { ServerZGeneratedConfig } from "../../src/config.generated.js"
import { For } from "../_utilities.js"

export async function generate(config: ServerZGeneratedConfig) {
    const existingFile = Bun.file(`${config.meta.dataDirectory}/ban.txt`)
    let existingNonServerZLines: string[] = []
    if (await existingFile.exists()) {
        const existingText = await existingFile.text()
        const existingLines = existingText.split("\n")
        existingNonServerZLines = existingLines.filter((l) => !l.endsWith("//ServerZ"))
    }
    return <>
        <For each={config.meta.banned}>
            {(steamID64) => `${steamID64} //ServerZ`}
        </For>
        <For each={existingNonServerZLines}>
            {(line) => `${line}`}
        </For>
    </>
}
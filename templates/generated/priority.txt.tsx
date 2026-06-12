import type { ServerZGeneratedConfig } from "../../src/config.generated.js"
import { For } from "../_utilities.js"

export function generate({ meta: { priority } }: ServerZGeneratedConfig) {
    return <>
        <For each={priority}>
            {(steamID64) => `${steamID64}`}
        </For>
    </>
}
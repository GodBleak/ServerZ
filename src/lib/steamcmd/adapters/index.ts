export { CLI } from "./cli.js"
export { Console } from "./console.js"
export { NodePTY } from "./nodePTY.js"

export interface AdapterOptions {
    /**
     * The path to the steamcmd binary.
     */
    bin: string;
    /**
     * The string to look for in the output to know when a command has finished.
     * Only applicable to the Console adapter.
     */
    sentinel?: string
    /**
     * The delimiter to use when joining commands into a string.
     * Only applicable to the CLI adapter.
     */
    delimiter?: string
}
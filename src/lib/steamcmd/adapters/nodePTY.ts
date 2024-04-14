import type { SteamCMDAdapter } from ".."
import { AdapterOptions } from "."

import { stat } from "fs/promises"
import stripAnsi from "strip-ansi"
import { type IPty, spawn as spawnPTY, IDisposable } from "node-pty"

export class NodePTY implements SteamCMDAdapter {
    private bin: string
    private sentinel: string
    private child: IPty | undefined
    private _ready: boolean = false
    public get ready(): boolean {
        return this._ready
    }
    constructor(options: AdapterOptions) {
        this.bin = options.bin
        this.sentinel = options.sentinel ?? "Steam>\x1B[0m"
    }

    public async init(): Promise<void> {
        const exists = await stat(this.bin)
            .then(() => true)
            .catch(() => false)
        if (!exists) throw new Error(`${this.bin} cannot be found!`)
        let disposeListener: IDisposable | undefined
        const childDidSpawn = await new Promise<boolean>((resolve, reject) => {
            this.child = spawnPTY(this.bin, [], {
                name: "xterm-color",
                cols: 80,
                rows: 30,
                cwd: process.env.HOME,
                env: process.env,
            })

            disposeListener = this.child.onData((data) => {
                if (data.endsWith(this.sentinel)) {
                    resolve(true)
                }
            })
        })
        if (disposeListener) disposeListener?.dispose()
        if (childDidSpawn !== true) throw new Error("SteamCMD did not spawn correctly")
        this._ready = true
    }

    public setCredentials(username: string, password?: string | undefined, code?: string | undefined): void {}

    private async executeCommand(command: string, callback?: (data: string[]) => void): Promise<string[]> {
        if (!this.ready) throw new Error("SteamCMD is not ready, did you call and await init()?")
        return new Promise((resolve, reject) => {
            let output = [] as string[]
            let disposeListener: IDisposable | undefined
            const onData = (data: string) => {
                if (data.endsWith(this.sentinel)) {
                    if (disposeListener) disposeListener?.dispose()
                    const lines = stripAnsi(data).split("\r\n")
                    for (const line of lines) {
                        if (line.endsWith(stripAnsi(this.sentinel))) continue
                        output.push(line)
                    }
                    output = output.filter((line) => line.length > 0)
                    if (callback) callback(output)
                    resolve(output)
                } else {
                    let lines = data.split("\r\n")
                    lines = lines.filter((line) => line.length > 0)
                    lines = lines.map((line) => line.trim())
                    output = output.concat(lines)

                    if (callback) callback(lines)
                }
            }

            this.child!.write(command + "\n")
            disposeListener = this.child!.onData(onData)
        })
    }

    public async processCommands(commands: string[], callback?: (data: { [command: string]: string[] }) => void): Promise<string[]> {
        let output = [] as string[]
        for (const command of commands) {
            const result = await this.executeCommand(command, callback ? (data) => callback({ [command]: data }) : undefined)
            output = output.concat(result)
        }
        return output
    }
}

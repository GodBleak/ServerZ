import { AdapterOptions } from "."
import { SteamCMDAdapter } from ".."

import { exec } from "child_process"
import { stat } from "fs/promises"

export class CLI implements SteamCMDAdapter {
    private bin: string
    private delimiter: string
    private _ready: boolean = false
    public get ready(): boolean {
        return this._ready
    }

    constructor(options: AdapterOptions) {
        this.bin = options.bin
        this.delimiter = options.delimiter ?? "+"
    }

    public async init(): Promise<void> {
        const exists = await stat(this.bin)
            .then(() => true)
            .catch(() => false)
        if (!exists) throw new Error(`${this.bin} cannot be found!`)
        this._ready = true
    }

    private async executeCommand(command: string, callback?: (data: string[]) => void): Promise<string[]> {
        if (!this.ready) throw new Error("SteamCMD is not ready, did you call and await init()?")
        return new Promise((resolve, reject) => {
            exec(`${this.bin} ${command} +exit`, (error, stdout) => {
                if (error) reject(error)
                const lines = stdout.split("\n")
                if (callback) callback(lines)
                resolve(lines)
            })
        })
    }

    public async processCommands(command: string[], callback?: (data: { [command: string]: string[] }) => void): Promise<string[]> {
        const commandString = this.delimiter + command.join(" " + this.delimiter)
        return this.executeCommand(commandString, callback ? (data) => callback({ [commandString]: data }) : undefined)
    }
}

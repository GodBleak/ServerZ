import { AdapterOptions } from '.';
import type { SteamCMDAdapter } from '..';

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import {stat} from "fs/promises"
import stripAnsi from 'strip-ansi';

export class Console implements SteamCMDAdapter {
    private bin: string;
    private sentinel: string;
    private child: ChildProcessWithoutNullStreams | undefined;
    private _ready: boolean = false;
    public get ready(): boolean {
        return this._ready;
    }
    constructor(options: AdapterOptions) {
        this.bin = options.bin;
        this.sentinel = options.sentinel ?? "Steam>\x1B[0m";
    }

    public async init(): Promise<void> {
        const exists = await stat(this.bin).then(() => true).catch(() => false);
        if (!exists) throw new Error(`${this.bin} cannot be found!`);
        const childDidSpawn = await new Promise<boolean>((resolve, reject) => {
            const onExit = (code: number) => {
                if (code !== 0) reject(new Error(`SteamCMD exited with code ${code}`));
            }
            const onData = (data: string) => {
                if(data.endsWith(this.sentinel)) {
                    this.child!.off('error', reject);
                    this.child!.off('exit', onExit);
                    this.child!.stdout.off('data', onData);
                    resolve(true)
                }
            }

            this.child = spawn(this.bin, {
                shell: true,
            });
            this.child.stdout.setEncoding('utf8');
            this.child.on('error', reject);
            this.child.on('exit', onExit);
            this.child.stdout.on('data', onData);
            this.child.stderr.on('data', (data) => {
                console.error(data);
            })

        });
        if (childDidSpawn !== true) throw new Error('SteamCMD did not spawn correctly');
        this._ready = true;
    }

    public setCredentials(username: string, password?: string | undefined, code?: string | undefined): void {}

    private async executeCommand(command: string, callback?: (data: string[]) => void): Promise<string[]> {
        if (!this.ready) throw new Error('SteamCMD is not ready, did you call and await init()?');
        return new Promise((resolve, reject) => {
            let output = [] as string[];
            const onData = (data: string) => {
                if(data.endsWith(this.sentinel)) {
                    this.child!.stdout.off('data', onData);
                    const lines = stripAnsi(data).split('\n');
                    for(const line of lines) {
                        if(line.endsWith(stripAnsi(this.sentinel))) continue;
                        output.push(line);
                    }
                    output = output.filter(line => line.length > 0);
                    if(callback) callback(output);
                    resolve(output)
                } else {
                    const lines = data.split('\n');
                    output = output.concat(lines);
                    if (callback) callback(lines);
                }
            }

            this.child!.stdin.write(command + "\n");
            this.child!.stdout.on('data', onData);
        });
    }

    public async processCommands(commands: string[], callback?: (data: {[command: string]: string[]}) => void): Promise<string[]> {
        let output = [] as string[];
        for(const command of commands) {
            const result = await this.executeCommand(command, callback ? (data) => callback({[command]: data}) : undefined);
            output = output.concat(result);
        }
        return output;
    }
}
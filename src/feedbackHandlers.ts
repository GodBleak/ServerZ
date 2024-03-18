import { config } from "./config.js"

import CLIProgress from "cli-progress"

/*
    This file is a mess, but it's basically just for parsing the output of SteamCMD and displaying it in a more user-friendly way.
    It's not critical to the functionality of the program, so I'm not going to bother cleaning it up right now.
    However, I did take care to make sure it's easily detachable from the rest of the program -- it can be easily ripped out if its complexity becomes a problem, before I get around to cleaning it up.
*/

export class ServerDownloadFeedback {
    private downloadBar = new CLIProgress.SingleBar({format: ` {bar} | {state} | chunk {value}/{total}`, clearOnComplete: false, noTTYOutput: true}, CLIProgress.Presets.shades_classic);
    private finishDownloadBar: (() => void) | null = null;
    private verifyBar = new CLIProgress.SingleBar({format: ` {bar} | {state} | chunk {value}/{total}`, clearOnComplete: false, noTTYOutput: true}, CLIProgress.Presets.shades_classic);
    private finishVerifyBar: (() => void) | null = null;
    private downloadState: string | null = null;
    private total: number = 1;
    private current: number = 0;
    private progress: number = 0;
    constructor() {
        this.downloadBar.start(this.total, this.current, {state: "initializing", progress: this.progress});
        this.finishDownloadBar = () => this.downloadBar.start(1, 1, {state: "initializing", progress: 100});
        this.finishVerifyBar = () => this.verifyBar.start(1, 1, {state: "initializing", progress: 100});
    }

    public update = (data: Record<string, string[]>) => {
        const dataKeys = Object.keys(data);
        const updateKey = dataKeys.find((key) => key.startsWith("app_update"));
        if(updateKey) {
            const updates = data[updateKey];
            const update = updates[updates.length - 1];
            if(update){
                if(update.toLowerCase().includes("error!")) {
                    this.downloadState = "error";
                    this.downloadBar.stop();
                    return console.error("Error downloading update\n", update);
                }
                if(this.downloadState === "error") return;
                const stateMatch = update.match(/Update state \((0x[0-9a-f]+)\) (.+),/);
                const currentState = stateMatch ? stateMatch[2] : null;
                const progressMatch = update.match(/progress: ([0-9.]+) \((\d+) \/ (\d+)\)/);
                if(currentState === "downloading"){
                    if(currentState !== this.downloadState) {
                        this.downloadState = currentState;
                    }
                    if(progressMatch) {
                        const [_, progress, current, total] = progressMatch;
                        this.total = parseInt(total);
                        this.current = parseInt(current);
                        this.progress = parseFloat(progress);
                        this.downloadBar.setTotal(parseInt(total));
                        this.downloadBar.start(this.total, this.current, {state: `Downloading App ${config.meta.appID}`, progress: this.progress});
                        this.finishDownloadBar = () => this.downloadBar.start(this.total, this.total, {state: this.downloadState, progress: 100});
                    } else {
                        this.downloadBar.start(this.total, this.current, {state: update, progress: this.progress});
                    }
                }
                if(currentState === "verifying update"){
                    if(currentState !== this.downloadState) {
                        this.finishDownloadBar?.();
                        this.downloadBar.stop();
                        this.downloadState = currentState;
                    }
                    if(progressMatch) {
                        const [_, progress, current, total] = progressMatch;
                        this.total = parseInt(total);
                        this.current = parseInt(current);
                        this.progress = parseFloat(progress);
                        this.verifyBar.setTotal(parseInt(total));
                        this.verifyBar.start(this.total, this.current, {state: `Verifying App ${config.meta.appID}`, progress: this.progress});
                        this.finishVerifyBar = () => this.verifyBar.start(this.total, this.total, {state: this.downloadState, progress: 100});
                    } else {
                        this.verifyBar.start(this.total, this.current, {state: update, progress: this.progress});
                    }
                }
            }
        }        
    
    }

    finish(result: string[]) {
        if(this.downloadState === "error") {
            console.error("Errors occurred during download:\n\n", result.join("\n"));
        } else {
            if(this.downloadState !== "verifying update") {
                this.finishDownloadBar?.();
                this.downloadBar.stop();
            }
            this.finishVerifyBar?.();
            this.verifyBar.stop();
        }
    }
}

export class ModInstallationFeedback {
    private bar = new CLIProgress.SingleBar({format: " {bar} | updating mod: {currentMod} | {value}/{total}", clearOnComplete: false, noTTYOutput: true}, CLIProgress.Presets.shades_classic);
    private finishedMods: number = 0;
    private currentMod: string | null = null;
    constructor() {
        this.bar.start(config.meta.modList.length, 0, {currentMod: "initializing", progress: 0});
    }

    public update = (data: Record<string, string[]>) => {
        const dataKeys = Object.keys(data);
        const updateKey = dataKeys.find((key) => key.startsWith("workshop_download_item"));
        if(updateKey) {
            const [_, app, thisMod] = updateKey.split(" ");
            const updates = data[updateKey];
            const isDone = updates.some((update) => update.startsWith("Success. Downloaded item"));
            if(isDone) {
                this.finishedMods++;
                this.bar.update(this.finishedMods, {currentMod: thisMod, progress: this.finishedMods/config.meta.modList.length});
            }
            if(thisMod !== this.currentMod) {
                this.bar.update(this.finishedMods, {currentMod: thisMod, progress: this.finishedMods/config.meta.modList.length});
                this.currentMod = thisMod;
            }

        }
    }

    finish(result: string[]) {
        if(this.finishedMods !== config.meta.modList.length) {
            console.error("\n\nSome mods didn't install:\n\n", result.join("\n"));
            throw new Error("Mod Installation Failed");
        }
        this.bar.stop();
    }
}
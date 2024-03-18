import { config } from "./config.js"
import { generateConfig } from "./generateConfig.js"
import { ModInstallationFeedback, ServerDownloadFeedback } from "./feedbackHandlers.js";
import type { SteamCMD } from "./lib/index.js";

import { readFile, link, symlink, cp, stat, readdir, writeFile, rm, mkdir} from "fs/promises";
import { spawn } from "child_process";
import Git from "simple-git"
import { unzip } from 'unzipit';

export class Server {
    private modNameList:string[] = []

    constructor(private steamCMD: SteamCMD) {}
    /**
     * Generates the command to start the server, based on configuration and mod list.
     * 
     * @returns The command to start the server.
     */
    private getStartCommand() {
        let commandComponents = [config.meta.dayZBinaryPath, `-config=${config.meta.configPath}`, `-port=${config.meta.port}`, `"-profiles=${config.meta.profilesPath}"`];
        if(this.modNameList.length > 0) commandComponents.push(`"-mod=@${this.modNameList.join(";@")}"`);
        commandComponents.push(`-cpuCount=${config.meta.cpuCount}`);
        if(config.meta.doLogs) commandComponents.push("-dologs");
        if(config.meta.adminLog) commandComponents.push("-adminlog");
        if(config.meta.netLog) commandComponents.push("-netlog");
        if(config.meta.freezeCheck) commandComponents.push("-freezecheck");
        if(config.meta.extraStartupArgs) commandComponents.push(config.meta.extraStartupArgs);
        return commandComponents.join(" ");
    }

    /**
     * Removes any mods from the server directory that are not included in the current mod list.
     */
    private async cleanMods() {
        if(!(await exists(config.meta.modPath))) return;
        const mods = await readdir(config.meta.modPath)
        const disabledMods = mods.map((mod) => parseInt(mod)).filter((mod) => !config.meta.modList.includes(mod));
        const disabledModNames = await Promise.all(disabledMods.map(getModName))
        for(const [id, name] of disabledModNames) {
            const keyPath = await getKeysPath(id);
            const keys = await readdir(keyPath);
            for(const key of keys) {
                const keyExistsInRootKeys = await exists(`${config.meta.serverDirectory}/keys/${key}`);
                if(!keyExistsInRootKeys) continue;
                await rm(`${config.meta.serverDirectory}/keys/${key}`);
            }
            const modExistsInServerRoot = await exists(`${config.meta.serverDirectory}/@${name}`);
            if (modExistsInServerRoot) await rm(`${config.meta.serverDirectory}/@${name}`, {recursive: true});
            await rm(`${config.meta.modPath}/${id}`, {recursive: true})
        }
    }

    /**
     * Downloads a map from a given URL and extracts it to the maps directory.
     */
    private async downloadMap(url: string) {
        console.log(`Downloading map from ${url}`);
        await download(url, config.meta.mapsPath, config.meta.updateMap);
    }

    private async updateMPMissions() {
        const missionPath = `${config.meta.serverDirectory}/mpmissions/${config.server.template}`;
        const missionExists = await exists(missionPath);
        if(missionExists) return;
        if(config.meta.copyMission) {
            console.log(`Copying mission from ${config.meta.missionPath} to ${missionPath}`)
            await cp(config.meta.mapsPath, missionPath);
        } else {
            console.log(`Symlinking mission from ${config.meta.missionPath} to ${missionPath}`)
            await symlink(config.meta.missionPath, missionPath);
        }
    }

    /**
     * Initializes the SteamCMD session.
     */
    public async init() {
        await this.steamCMD.init()
    }

    /**
     * Downloads the DayZ server files.
     */
    public async downloadServer() {
        if(config.meta.serverDirectory) this.steamCMD.forceDir(config.meta.serverDirectory)
        const downloadFeedback = new ServerDownloadFeedback();
        const result = await this.steamCMD
            .login(config.meta.steamUsername, config.meta.steamPassword, config.meta.steamGuardCode)
            .updateApp(config.meta.appID)
            .verify()
            .execute(downloadFeedback.update);
        downloadFeedback.finish(result);
    }

    /**
     * Downloads/updates and installs the mods listed in the configuration.
     */
    public async updateMods() {
        if(config.meta.cleanMods) await this.cleanMods();
        if(!config.meta.modList.length) return console.log("No mods to install");
        const modFeedback = new ModInstallationFeedback();
        if(config.meta.serverDirectory) this.steamCMD.forceDir(config.meta.serverDirectory)
        this.steamCMD.login()
        for(const mod of config.meta.modList) {
            this.steamCMD.workshopDownload(config.meta.modAppID, mod)
        }
        const result = await this.steamCMD.execute((data) => {
            modFeedback.update(data);
        });
        modFeedback.finish(result);
    
        console.log("\nFetching mod names")
        const modNames = await Promise.all(config.meta.modList.map(getModName));
        console.log("Creating mod folders in server directory");
        await Promise.all(modNames.map(([id, name]) => createModSymlink(id, name)));
        console.log("Adding mod keys to server 'keys' directory")
        await Promise.all(modNames.map(([id]) => createModKeyLinks(id)));
        this.modNameList = modNames.map(([id, name]) => name);
    }

    /**
     * Sets up a custom map and symlinks the mpmissions directory to the server directory.
     * Will also download the map if a URL is provided in the configuration.
     */
    public async updateMap() {
        await mkdir(config.meta.mapsPath, {recursive: true});
        if(config.meta.mapURL) await this.downloadMap(config.meta.mapURL);
        await this.updateMPMissions();
    }

    /**
     * Generates a server configuration file based on environment variables, and writes it to the server directory.
     * The resulting file is named `serverDZ.generated.cfg`.
     */
    public async writeConfig() {
        console.log("Writing serverDZ.generated.cfg")
        const configFile = generateConfig();
        await writeFile(`${config.meta.serverDirectory}/serverDZ.generated.cfg`, configFile);
    }

    /**
     * Starts the DayZ server.
     * 
     * The server is spawned in the `serverDirectory` and detached from the current process.
     * @returns The spawned server process.
     */
    public start() {
        const command = this.getStartCommand();
        console.log(`Starting server with command: ${command}\n\n`);
        const server = spawn(command, {
            shell: true,
            detached: true,
            cwd: config.meta.serverDirectory,
            stdio: "inherit"
        });
        console.log(`Reigns passed to DayZServer(${server.pid}). Good luck, Survivor!\n\n`);
        return server;
    }
}

/**
 *  Checks if a file or directory exists.
 * @param {string} path - The path to check.
 * @returns {Promise<boolean>} A promise that resolves with a boolean indicating whether the file or directory exists.
 */
async function exists(path: string): Promise<boolean> {
    return await stat(path).then(() => true).catch(() => false);
} 

/**
 * Fetches the name of a mod by reading its metadata file.
 * @param {number} id The mod's ID.
 * @returns {Promise<[number, string]>} A promise that resolves with the mod ID and name.
 */
async function getModName(id: number): Promise<[id: number, name: string]>{
    const meta = await readFile(`${config.meta.modPath}/${id}/meta.cpp`);
    const name = meta.toString().match(/name\s*=\s*"(.*)"/);
    if(!name) throw new Error(`Could not get metadata for mod ${id}`);
    return [id, name[1]];
}

/**
 * Creates a symbolic link from a mod's folder in the workshop directory to it's own folder, named by mod name rather than ID, in the server directory.
 * 
 * @param {number} id The mod's ID.
 * @param {string} name The mod's name.
 */
async function createModSymlink(id: number, name: string) {
    const sourcePath = `${config.meta.modPath}/${id}`;
    const targetPath = `${config.meta.serverDirectory}/@${name}`;
    const targetExists = await exists(targetPath);
    if(targetExists) return;
    await symlink(sourcePath, targetPath);
}

/**
 * Creates links for all keys within a mod's keys directory to the server's keys directory.
 * 
 * @param {number} id The mod's ID.
 */
async function createModKeyLinks(id: number) {
    const keysPath = await getKeysPath(id);
    const keys = await readdir(keysPath);
    for(const key of keys) {
        const sourcePath = `${keysPath}/${key}`;
        const targetPath = `${config.meta.serverDirectory}/keys/${key}`;
        const targetExists = await exists(targetPath);
        if(targetExists) continue;
        await link(sourcePath, targetPath);
    }
}

/**
 * Fetches the correct path to a mod's keys directory.
 * 
 * @param {number} id The mod's ID.
 * @returns The path to the mod's keys directory.
 * @throws If the keys directory cannot be found.
 */
async function getKeysPath(id: number) {
    // Some mods use "keys" and others use "Keys" 🤬
    const modDir = await readdir(`${config.meta.modPath}/${id}`);
    let keysDir = modDir.find((dir) => dir === "keys");
    if(!keysDir) keysDir = modDir.find((dir) => dir === "Keys");
    if(!keysDir) throw new Error(`Could not find keys directory for mod ${id}`);
    return `${config.meta.modPath}/${id}/${keysDir}`;
}

/**
 * Downloads a file from a given URL and extracts it to a given directory.
 * Handles git repositories and zip files.
 * 
 * @param from - The URL to clone/download from.
 * @param to - The directory to extract to.
 * @param overwrite - Whether to overwrite or update existing files.
 */
async function download(from: string, to: string, overwrite: boolean) {
    const url = from.endsWith("/") ? from.slice(0, -1) : from;
    const extension = 
        url.endsWith(".git") ?
        "git" :
        url.endsWith(".zip") ?
        "zip" :
        "unknown";
    if(extension === "git") return await getWithGit(url, to, overwrite);
    else if(extension === "zip") return await getAndExtractZip(url, to, overwrite);
    else throw new Error(`Unsupported map download type: ${extension}`);
}

/**
 * Clones a git repository to a given directory, or pulls if it already exists and `update` is true.
 * 
 * @param from - The URL to clone from.
 * @param to - The directory to clone to.
 * @param update - Whether to pull if the directory already exists.
 * @returns 
 */
async function getWithGit(from: string, to: string, update: boolean) {
    const repo = from.split("/").pop();
    const repoName = repo?.split(".")[0];
    const targetDir = `${to}/${repoName}`
    const targetDirExists = await exists(targetDir);
    if(targetDirExists) {
        if(!update) return;
        const git = Git({
            baseDir: targetDir
        })
        return await git.pull()
    } else {
        const git = Git({
            baseDir: to
        })
        return await git.clone(from)
    }
}

/**
 * Downloads a zip file from a given URL and extracts it to a given directory.
 * 
 * @param from - The URL to download from.
 * @param to - The directory to extract to.
 * @param overwrite - Whether to overwrite existing files.
 */
async function getAndExtractZip(from: string, to: string, overwrite: boolean) {
    const response = await fetch(from);
    const arrayBuffer = await response.arrayBuffer();
    const zipBuffer = new Uint8Array(arrayBuffer);
    const {zip, entries} = await unzip(zipBuffer);
    
    for(const key in entries) {
        const splitPath = key.split("/");
        const isRoot = splitPath.length === 1;
        if(isRoot) {
            const targetPath = `${to}/${key}`;
            const targetExists = await exists(targetPath);
            if(targetExists && !overwrite) break;
        }
        const entry = entries[key];
        if(entry.isDirectory) await mkdir(`${to}/${key}`, {recursive: true});
        else {
            const file = await entry.arrayBuffer();
            await writeFile(`${to}/${key}`, new Uint8Array(file))
        }
    }
}
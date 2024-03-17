import { config } from "./config.js"
import { ServerManager } from "./serverManager.js";
import { SteamCMD } from "./lib/index.js";
import { NodePTY } from "./lib/steamcmd/adapters/index.js";

async function main() {
    const adapter = new NodePTY({bin: config.meta.steamBinaryPath})
    const steamCMD = new SteamCMD(adapter);
    const serverManager = new ServerManager(steamCMD);

    await serverManager.init()
    if(!config.meta.skipUpdate) await serverManager.downloadServer();
    if(!config.meta.skipMods) await serverManager.updateMods();
    await serverManager.writeConfig();
    if(config.meta.startDayZServer) serverManager.startServer();
}

main();
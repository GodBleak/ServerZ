import { config } from "./config.js"
import { Server } from "./server.js"
import { SteamCMD } from "./lib/index.js"
import { NodePTY } from "./lib/steamcmd/adapters/index.js"

async function main() {
    const adapter = new NodePTY({ bin: config.meta.steamBinaryPath })
    const steamCMD = new SteamCMD(adapter)
    const server = new Server(steamCMD)

    await server.init()
    if (!config.meta.skipUpdate) await server.downloadServer()
    if (!config.meta.skipMods) await server.updateMods()
    await server.updateMap()
    await server.writeConfig()
    await server.writeBEConfig()
    if (config.meta.startDayZServer) server.start()
}

main()

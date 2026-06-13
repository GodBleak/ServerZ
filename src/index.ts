import { config } from "#config"
import { logger } from "#lib/logger"
import { SteamAPI } from "#lib/steamapi"
import { hang } from "#lib/hang"
import { Server } from "./server.js"
import { overlay } from "./overlay.js"
import { wipe } from "./wipe.js"
import qrcode from "qrcode-terminal"
import type { QrChallenge } from "depot-client/src/types.js"

async function main() {
  const steam = new SteamAPI(config.steam.configDirectory, `${config.steam.configDirectory}/auth`, "serverz", { onQRChallenge, loginTimeout: 60000 })
  steam.on("debug", logger.scrub().debug)
  const server = new Server(steam)

  if (config.meta.wipe === true || config.meta.wipe === "dry-run") {
    await wipe()
    await hang()
  }

  await overlay.configure()

  if (!config.meta.skipUpdate || !config.meta.skipMods) await server.doSteamLogin()
  if (!config.meta.skipUpdate) await server.updateServer()
  if (!config.meta.skipMods) await server.updateMods()
  await server.loadMods()
  if (config.meta.cleanMods) await server.cleanMods()
  if (!config.meta.skipMap) await server.updateMap()
  await server.applyTemplates()
  if (config.meta.startDayZServer) server.start()
  else logger.warn("Server start disabled. START_DAYZ_SERVER may be set to false")
}

void main()

function onQRChallenge(challenge: QrChallenge) {
  logger.info("QR code challenge received. Please scan the following QR code with your Steam mobile app to log in:")
  logger.info(`QR Challenge URL: ${challenge.qrChallengeUrl}`)
  qrcode.generate(challenge.qrChallengeUrl, { small: true })
}

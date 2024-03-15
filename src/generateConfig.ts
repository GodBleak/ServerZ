import { config } from "./config.js"

export function generateConfig() {
    return `
hostname = "${config.server.serverName}";
password = "${config.server.password}";
passwordAdmin = "${config.server.adminPassword}";
maxPlayers = ${config.server.maxPlayers};
verifySignatures = ${config.server.verifySignatures};
forceSameBuild = ${config.server.forceSameBuild};
disableVoN = ${config.server.disableVon};
vonCodecQuality = ${config.server.vonCodecQuality};
disable3rdPerson=${config.server.disable3rdPerson};
disableCrosshair=${config.server.disableCrosshair};
serverTime="${config.server.serverTime}";
serverTimeAcceleration=${config.server.serverTimeAcceleration};
serverNightTimeAcceleration = ${config.server.serverNightTimeAcceleration};
serverTimePersistent=${config.server.serverTimePersistent};
guaranteedUpdates=${config.server.guaranteedUpdates};
loginQueueConcurrentPlayers=${config.server.loginQueueConcurrentPlayers};
loginQueueMaxPlayers=${config.server.loginQueueMaxPlayers};
instanceId = ${config.server.instanceID};
storageAutoFix = ${config.server.storageAutoFix};
motd[] = {"", "${config.server.motd}"};
respawnTime = ${config.server.respawnTime};
motdInterval = ${config.server.motdInterval};
maxPing= ${config.server.maxPing};
timeStampFormat = "${config.server.timestampFormat}";
logAverageFps = ${config.server.logAverageFPS};
logMemory = ${config.server.logMemory};
logPlayers = ${config.server.logPlayers};
logFile = "${config.server.logFile}";
adminLogPlayerHitsOnly = ${config.server.adminLogPlayerHitsOnly};
adminLogPlacement = ${config.server.adminLogPlacement};
adminLogBuildActions = ${config.server.adminLogBuildActions};
adminLogPlayerList = ${config.server.adminLogPlayerList};
enableDebugMonitor = ${config.server.enableDebugMonitor};
allowFilePatching = ${config.server.allowFilePatching};
simulatedPlayersBatch = ${config.server.simulatedPlayersBatch};
multithreadedReplication = ${config.server.multithreadedReplication};
speedhackDetection = ${config.server.speedhackDetection};
networkRangeClose = ${config.server.networkRangeClose};
networkRangeNear = ${config.server.networkRangeNear};
networkRangeFar = ${config.server.networkRangeFar};
networkRangeDistantEffect = ${config.server.networkRangeDistantEffect};
defaultVisibility=${config.server.defaultVisibility};
defaultObjectViewDistance=${config.server.defaultObjectViewDistance};
lightingConfig = ${config.server.lightingConfig};
disablePersonalLight = ${config.server.disablePersonalLight};
disableBaseDamage = ${config.server.disableBaseDamage};
disableContainerDamage = ${config.server.disableContainerDamage};
disableRespawnDialog = ${config.server.disableRespawnDialog};
lootHistory = ${config.server.lootHistory};
storeHouseStateDisabled = ${config.server.storeHouseStateDisabled};

class Missions
{
    class DayZ
    {
        template="dayzOffline.chernarusplus";
    };
};
`}

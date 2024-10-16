import { config } from "./config.js"

export function generateConfig() {
    return `hostname = "${config.server.serverName}";
description = ${config.server.description};
password = "${config.server.password}";
passwordAdmin = "${config.server.adminPassword}";
maxPlayers = ${config.server.maxPlayers};
verifySignatures = ${config.server.verifySignatures};
forceSameBuild = ${config.server.forceSameBuild};
disableVoN = ${config.server.disableVon};
vonCodecQuality = ${config.server.vonCodecQuality};
disable3rdPerson = ${config.server.disable3rdPerson};
disableCrosshair = ${config.server.disableCrosshair};
serverTime = "${config.server.serverTime}";
serverTimeAcceleration = ${config.server.serverTimeAcceleration};
serverNightTimeAcceleration = ${config.server.serverNightTimeAcceleration};
serverTimePersistent = ${config.server.serverTimePersistent};
guaranteedUpdates = ${config.server.guaranteedUpdates};
loginQueueConcurrentPlayers = ${config.server.loginQueueConcurrentPlayers};
loginQueueMaxPlayers = ${config.server.loginQueueMaxPlayers};
instanceId = ${config.server.instanceID};
storageAutoFix = ${config.server.storageAutoFix};
motd[] = {"", "${config.server.motd}"};
steamQueryPort = ${config.server.steamQueryPort};
respawnTime = ${config.server.respawnTime};
motdInterval = ${config.server.motdInterval};
maxPing = ${config.server.maxPing};
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
networkObjectBatchLogSlow = ${config.server.networkObjectBatchLogSlow};
networkObjectBatchEnforceBandwidthLimits = ${config.server.networkObjectBatchEnforceBandwidthLimits};
networkObjectBatchUseEstimatedBandwidth = ${config.server.networkObjectBatchUseEstimatedBandwidth};
networkObjectBatchUseDynamicMaximumBandwidth = ${config.server.networkObjectBatchUseDynamicMaximumBandwidth};
networkObjectBatchBandwidthLimit = ${config.server.networkObjectBatchBandwidthLimit};
networkObjectBatchCompute = ${config.server.networkObjectBatchCompute};
networkObjectBatchSendCreate = ${config.server.networkObjectBatchSendCreate};
networkObjectBatchSendDelete = ${config.server.networkObjectBatchSendDelete};
defaultVisibility = ${config.server.defaultVisibility};
defaultObjectViewDistance = ${config.server.defaultObjectViewDistance};
lightingConfig = ${config.server.lightingConfig};
disablePersonalLight = ${config.server.disablePersonalLight};
disableBaseDamage = ${config.server.disableBaseDamage};
disableContainerDamage = ${config.server.disableContainerDamage};
disableRespawnDialog = ${config.server.disableRespawnDialog};
pingWarning = ${config.server.pingWarning};
pingCritical = ${config.server.pingCritical};
serverFPSWarning = ${config.server.serverFpsWarning};
shotValidation = ${config.server.shotValidation};
clientPort = ${config.server.clientPort};

class Missions
{
    class DayZ
    {
        template="${config.server.template}";
    };
};
`
}

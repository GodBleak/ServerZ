import type { ServerZGeneratedConfig } from "../../src/config.generated.js"
import { createSet, Show, escapeQuotes } from "../_utilities.js"

const Set = createSet(" = ", ";\n");

export function generate({ server }: ServerZGeneratedConfig) {
    return (
        <>
            <Set name="hostname" value={server.serverName} quoted />
            <Set name="description" when={server.description} quoted />
            <Set name="password" when={server.password} quoted />
            <Set name="enableWhitelist" value={NumericBoolean(server.enableWhitelist)} />
            <Set name="disableBanlist" value={server.disableBanlist} />
            <Set name="disablePrioritylist" value={server.disablePrioritylist} />
            <Set name="passwordAdmin" when={server.adminPassword} quoted />
            <Set name="maxPlayers" value={server.maxPlayers} />
            <Set name="verifySignatures" value={server.verifySignatures} />
            <Set name="forceSameBuild" value={NumericBoolean(server.forceSameBuild)} />
            <Set name="disableVoN" value={NumericBoolean(server.disableVon)} />
            <Set name="vonCodecQuality" value={server.vonCodecQuality} />
            <Set name="disable3rdPerson" value={NumericBoolean(server.disable3rdPerson)} />
            <Set name="disableCrosshair" value={NumericBoolean(server.disableCrosshair)} />
            <Set name="serverTime" when={server.serverTime} quoted />
            <Set name="serverTimeAcceleration" value={server.serverTimeAcceleration} />
            <Set name="serverNightTimeAcceleration" value={server.serverNightTimeAcceleration} />
            <Set name="serverTimePersistent" value={NumericBoolean(server.serverTimePersistent)} />
            <Set name="guaranteedUpdates" value={server.guaranteedUpdates} />
            <Set name="loginQueueConcurrentPlayers" value={server.loginQueueConcurrentPlayers} />
            <Set name="loginQueueMaxPlayers" value={server.loginQueueMaxPlayers} />
            <Set name="instanceId" value={server.instanceID} />
            <Set name="storageAutoFix" value={NumericBoolean(server.storageAutoFix)} />
            {/* "Additional Parameters", thus all are intentionally optional */}
            <Set name="respawnTime" when={typeof server.respawnTime === 'number'} value={server.respawnTime} />
            <Show when={server.motd.length}>
            // ServerZ: DayZServer seems to ignore the first MOTD. It's intentionally left empty here.
            </Show>
            <Set name="motd[]" when={server.motd.length} value={() => `{ "", ${server.motd.map((m) => `"${escapeQuotes(m)}"`).join(", ")} }`} />
            <Set name="motdInterval" when={typeof server.motdInterval === 'number'} value={server.motdInterval} />
            <Set name="timeStampFormat" when={server.timestampFormat} quoted />
            <Set name="logAverageFps" when={typeof server.logAverageFPS === "number"} value={server.logAverageFPS} />
            <Set name="logMemory" when={typeof server.logMemory === "number"} value={server.logMemory} />
            <Set name="logPlayers" when={typeof server.logPlayers === "number"} value={server.logPlayers} />
            <Set name="logFile" when={server.logFile} quoted />
            <Set name="adminLogPlayerHitsOnly" when={typeof server.adminLogPlayerHitsOnly === "boolean"} value={NumericBoolean(server.adminLogPlayerHitsOnly)} />
            <Set name="adminLogPlacement" when={typeof server.adminLogPlacement === "boolean"} value={NumericBoolean(server.adminLogPlacement)} />
            <Set name="adminLogBuildActions" when={typeof server.adminLogBuildActions === "boolean"} value={NumericBoolean(server.adminLogBuildActions)} />
            <Set name="adminLogPlayerList" when={typeof server.adminLogPlayerList === "boolean"} value={NumericBoolean(server.adminLogPlayerList)} />
            <Set name="disableMultiAccountMitigation" when={typeof server.disableMultiAccountMitigation === "boolean"} value={NumericBoolean(server.disableMultiAccountMitigation)} />
            <Set name="enableDebugMonitor" when={typeof server.enableDebugMonitor === "boolean"} value={NumericBoolean(server.enableDebugMonitor)} />
            <Set name="steamQueryPort" when={server.steamQueryPort} />
            <Set name="allowFilePatching" when={typeof server.allowFilePatching === "boolean"} value={NumericBoolean(server.allowFilePatching)} />
            <Set name="simulatedPlayersBatch" when={typeof server.simulatedPlayersBatch === "number"} value={server.simulatedPlayersBatch} />
            <Set name="multithreadedReplication" when={typeof server.multithreadedReplication === "boolean"} value={NumericBoolean(server.multithreadedReplication)} />
            <Set name="speedhackDetection" when={typeof server.speedhackDetection === "number"} value={server.speedhackDetection} />
            <Set name="networkRangeClose" when={typeof server.networkRangeClose === "number"} value={server.networkRangeClose} />
            <Set name="networkRangeNear" when={typeof server.networkRangeNear === "number"} value={server.networkRangeNear} />
            <Set name="networkRangeFar" when={typeof server.networkRangeFar === "number"} value={server.networkRangeFar} />
            <Set name="networkRangeDistantEffect" when={typeof server.networkRangeDistantEffect === "number"} value={server.networkRangeDistantEffect} />
            <Set name="networkObjectBatchLogSlow" when={typeof server.networkObjectBatchLogSlow === "number"} value={server.networkObjectBatchLogSlow} />
            <Set name="networkObjectBatchEnforceBandwidthLimits" when={typeof server.networkObjectBatchEnforceBandwidthLimits === "boolean"} value={NumericBoolean(server.networkObjectBatchEnforceBandwidthLimits)} />
            <Set name="networkObjectBatchUseEstimatedBandwidth" when={typeof server.networkObjectBatchUseEstimatedBandwidth === "boolean"} value={NumericBoolean(server.networkObjectBatchUseEstimatedBandwidth)} />
            <Set name="networkObjectBatchUseDynamicMaximumBandwidth" when={typeof server.networkObjectBatchUseDynamicMaximumBandwidth === "boolean"} value={NumericBoolean(server.networkObjectBatchUseDynamicMaximumBandwidth)} />
            <Set name="networkObjectBatchBandwidthLimit" when={typeof server.networkObjectBatchBandwidthLimit === "number"} value={server.networkObjectBatchBandwidthLimit} />
            <Set name="networkObjectBatchCompute" when={typeof server.networkObjectBatchCompute === "number"} value={server.networkObjectBatchCompute} />
            <Set name="networkObjectBatchSendCreate" when={typeof server.networkObjectBatchSendCreate === "number"} value={server.networkObjectBatchSendCreate} />
            <Set name="networkObjectBatchSendDelete" when={typeof server.networkObjectBatchSendDelete === "number"} value={server.networkObjectBatchSendDelete} />
            <Set name="defaultVisibility" when={typeof server.defaultVisibility === "number"} value={server.defaultVisibility} />
            <Set name="defaultObjectViewDistance" when={typeof server.defaultObjectViewDistance === "number"} value={server.defaultObjectViewDistance} />
            <Set name="lightingConfig" when={typeof server.lightingConfig === "number"} value={server.lightingConfig} />
            <Set name="disablePersonalLight" when={typeof server.disablePersonalLight === "boolean"} value={NumericBoolean(server.disablePersonalLight)} />
            <Set name="disableBaseDamage" when={typeof server.disableBaseDamage === "boolean"} value={NumericBoolean(server.disableBaseDamage)} />
            <Set name="disableContainerDamage" when={typeof server.disableContainerDamage === "boolean"} value={NumericBoolean(server.disableContainerDamage)} />
            <Set name="disableRespawnDialog" when={typeof server.disableRespawnDialog === "boolean"} value={NumericBoolean(server.disableRespawnDialog)} />
            <Set name="pingWarning" when={typeof server.pingWarning === "number"} value={server.pingWarning} />
            <Set name="pingCritical" when={typeof server.pingCritical === "number"} value={server.pingCritical} />
            <Set name="MaxPing" when={typeof server.maxPing === "number"} value={server.maxPing} />
            <Set name="serverFpsWarning" when={typeof server.serverFpsWarning === "number"} value={server.serverFpsWarning} />
            <Set name="shotValidation" when={typeof server.shotValidation === "boolean"} value={NumericBoolean(server.shotValidation)} />
            <Set name="clientPort" when={server.clientPort} />
            <Set name="enableCfgGameplayFile" when={typeof server.enableCfgGameplayFile === "boolean"} value={NumericBoolean(server.enableCfgGameplayFile)} />

            {`class Missions
{
	class DayZ
	{
		template = "${server.template}";
	};
};`}
        </>
    )
}

// Do not do validation here. If we made it this far with invalid values that's not a problem for this to solve.
function NumericBoolean(value: boolean | undefined | null): number | undefined {
    if (value === undefined || value === null) return undefined
    return value ? 1 : 0
}
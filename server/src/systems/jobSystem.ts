import type { TickContext } from '../tick';
import {
    getBuildingDefinitionForTile,
    resolveBuildingJobResources,
    type BuildingDefinition,
} from '../../../src/shared/buildings/registry';
import { isJobSiteEnabled } from '../../../src/shared/buildings/jobSites';
import { planNearestStorageDeposits } from '../../../src/shared/buildings/storage';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';
import { emitGameplayEvent } from '../../../src/shared/gameplay/events';
import {
    broadcastWorkforceState,
    getWorkforceSnapshot,
    setWorkforceSnapshot,
    type JobSiteSnapshot,
    type JobSiteStatus,
    type WorkforceSnapshot,
} from '../../../src/shared/game/state/jobStore';
import { getPopulationState } from '../../../src/shared/game/state/populationStore';
import {
    depositResourceToStorage,
    planResourceWithdrawalsAcrossStorages,
    resourceInventory,
    withdrawResourceAcrossStorages,
} from '../../../src/shared/game/state/resourceStore';
import { isTileActive } from '../../../src/shared/game/state/settlementSupportStore';
import type { ResourceAmount } from '../../../src/shared/game/types/Resource';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { tileIndex } from '../../../src/shared/game/world';
import type { ResourceDepositMessage, ResourceWithdrawMessage } from '../../../src/shared/protocol';
import { extractMineOre, getExtractableMineOre, getMineClusterReserve } from '../state/mineReserveState';

interface RuntimeSiteState {
    nextCycleMs: number;
    wasAssigned: boolean;
}

interface ResolvedJobSite {
    tile: Tile;
    building: BuildingDefinition;
    slots: number;
    assignedWorkers: number;
}

type SiteOperationalBlock = Extract<JobSiteStatus, 'missing_input' | 'storage_full' | 'depleted'>;

const siteRuntime = new Map<string, RuntimeSiteState>();

function isJobBuilding(building: BuildingDefinition | null | undefined): building is BuildingDefinition {
    return !!building
        && (building.jobSlots ?? 0) > 0
        && (building.cycleMs ?? 0) > 0
        && ((building.produces?.length ?? 0) > 0 || typeof building.getJobResources === 'function');
}

function compareResolvedSites(a: ResolvedJobSite, b: ResolvedJobSite) {
    if (a.building.sortOrder !== b.building.sortOrder) {
        return a.building.sortOrder - b.building.sortOrder;
    }

    return a.tile.id.localeCompare(b.tile.id);
}

function listResolvedJobSites() {
    const resolved: ResolvedJobSite[] = [];

    for (const tile of Object.values(tileIndex)) {
        if (!tile?.discovered) {
            continue;
        }

        const building = getBuildingDefinitionForTile(tile);
        if (!isJobBuilding(building)) {
            continue;
        }

        resolved.push({
            tile,
            building,
            slots: Math.max(0, building.jobSlots ?? 0),
            assignedWorkers: 0,
        });
    }

    resolved.sort(compareResolvedSites);
    return resolved;
}

function isOnlineJobSite(tile: Tile) {
    return tile.discovered
        && !!tile.controlledBySettlementId
        && isTileActive(tile);
}

function getAvailableWorkers() {
    const population = getPopulationState();
    return Math.max(0, Math.min(population.current, population.beds));
}

function assignWorkersEvenly(sites: ResolvedJobSite[], availableWorkers: number) {
    const assignableSites = sites.filter((site) => isOnlineJobSite(site.tile) && site.slots > 0);
    let remainingWorkers = availableWorkers;

    while (remainingWorkers > 0) {
        const candidates = assignableSites.filter((site) => {
            if (site.assignedWorkers >= site.slots) {
                return false;
            }

            return canAssignWorkersToSite(site, site.assignedWorkers + 1);
        });
        if (!candidates.length) {
            break;
        }

        candidates.sort((a, b) => {
            const fillA = a.assignedWorkers / Math.max(1, a.slots);
            const fillB = b.assignedWorkers / Math.max(1, b.slots);
            if (fillA !== fillB) {
                return fillA - fillB;
            }

            return compareResolvedSites(a, b);
        });

        candidates[0]!.assignedWorkers += 1;
        remainingWorkers -= 1;
    }
}

function capSiteOutputs(site: ResolvedJobSite, outputs: ResourceAmount[]) {
    if (site.building.key !== 'mine') {
        return outputs;
    }

    return outputs
        .map((resource) => {
            if (resource.type !== 'ore') {
                return resource;
            }

            return {
                ...resource,
                amount: getExtractableMineOre(site.tile, resource.amount),
            };
        })
        .filter((resource) => resource.amount > 0);
}

function resolveJobResources(site: ResolvedJobSite, assignedWorkers: number = site.assignedWorkers) {
    const resolved = resolveBuildingJobResources(site.building, site.tile, assignedWorkers);

    return {
        consumes: resolved.consumes,
        produces: capSiteOutputs(site, resolved.produces),
    };
}

function hasMissingInputs(resources: ResourceAmount[]) {
    return resources.some((resource) => (resourceInventory[resource.type] ?? 0) < resource.amount);
}

function buildFreedCapacityByTileId(resources: ResourceAmount[]) {
    const freedCapacityByTileId = new Map<string, number>();

    for (const resource of resources) {
        const plannedTransfers = planResourceWithdrawalsAcrossStorages(resource.type, resource.amount);
        const plannedAmount = plannedTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
        if (plannedAmount < resource.amount) {
            return null;
        }

        for (const transfer of plannedTransfers) {
            freedCapacityByTileId.set(
                transfer.storageTileId,
                (freedCapacityByTileId.get(transfer.storageTileId) ?? 0) + transfer.amount,
            );
        }
    }

    return freedCapacityByTileId;
}

function hasStorageCapacity(tile: Tile, inputs: ResourceAmount[], outputs: ResourceAmount[]) {
    if (!outputs.length) {
        return true;
    }

    const freedCapacityByTileId = buildFreedCapacityByTileId(inputs);
    if (freedCapacityByTileId === null) {
        return false;
    }

    return planNearestStorageDeposits(tile.q, tile.r, outputs, freedCapacityByTileId).remaining.length === 0;
}

function getSiteOperationalBlock(site: ResolvedJobSite, assignedWorkers: number): SiteOperationalBlock | null {
    if (assignedWorkers <= 0) {
        return null;
    }

    if (site.building.key === 'mine' && getMineClusterReserve(site.tile).totalRemaining <= 0) {
        return 'depleted';
    }

    const { consumes: scaledInputs, produces: scaledOutputs } = resolveJobResources(site, assignedWorkers);
    if (hasMissingInputs(scaledInputs)) {
        return 'missing_input';
    }

    if (!hasStorageCapacity(site.tile, scaledInputs, scaledOutputs)) {
        return 'storage_full';
    }

    return null;
}

function canAssignWorkersToSite(site: ResolvedJobSite, assignedWorkers: number) {
    if (!isOnlineJobSite(site.tile) || !isJobSiteEnabled(site.tile)) {
        return false;
    }

    const blocked = getSiteOperationalBlock(site, assignedWorkers);
    return blocked !== 'storage_full' && blocked !== 'depleted';
}

function resolveSiteStatus(site: ResolvedJobSite): JobSiteStatus {
    if (!isOnlineJobSite(site.tile)) {
        return 'offline';
    }

    if (!isJobSiteEnabled(site.tile)) {
        return 'paused';
    }

    if (site.assignedWorkers <= 0) {
        const previewBlock = getSiteOperationalBlock(site, Math.min(1, site.slots));
        if (previewBlock === 'storage_full' || previewBlock === 'depleted') {
            return previewBlock;
        }

        return 'unstaffed';
    }

    const operationalBlock = getSiteOperationalBlock(site, site.assignedWorkers);
    if (operationalBlock) {
        return operationalBlock;
    }

    return 'staffed';
}

function createSnapshot(sites: ResolvedJobSite[], availableWorkers: number): WorkforceSnapshot {
    const assignedWorkers = sites.reduce((sum, site) => sum + site.assignedWorkers, 0);

    return {
        availableWorkers,
        assignedWorkers,
        idleWorkers: Math.max(0, availableWorkers - assignedWorkers),
        sites: sites.map((site): JobSiteSnapshot => ({
            tileId: site.tile.id,
            buildingKey: site.building.key,
            slots: site.slots,
            assignedWorkers: site.assignedWorkers,
            status: resolveSiteStatus(site),
        })),
    };
}

function snapshotsEqual(a: WorkforceSnapshot, b: WorkforceSnapshot) {
    if (a.availableWorkers !== b.availableWorkers
        || a.assignedWorkers !== b.assignedWorkers
        || a.idleWorkers !== b.idleWorkers
        || a.sites.length !== b.sites.length) {
        return false;
    }

    for (let index = 0; index < a.sites.length; index++) {
        const siteA = a.sites[index]!;
        const siteB = b.sites[index]!;
        if (siteA.tileId !== siteB.tileId
            || siteA.buildingKey !== siteB.buildingKey
            || siteA.slots !== siteB.slots
            || siteA.assignedWorkers !== siteB.assignedWorkers
            || siteA.status !== siteB.status) {
            return false;
        }
    }

    return true;
}

function broadcastInputWithdrawals(resources: ResourceAmount[]) {
    for (const resource of resources) {
        const transfers = withdrawResourceAcrossStorages(resource.type, resource.amount);
        for (const transfer of transfers) {
            if (transfer.amount <= 0) {
                continue;
            }

            broadcast({
                type: 'resource:withdraw',
                heroId: 'colony',
                storageTileId: transfer.storageTileId,
                resource: {
                    type: resource.type,
                    amount: transfer.amount,
                },
            } satisfies ResourceWithdrawMessage);
        }
    }
}

function broadcastOutputDeposits(tile: Tile, outputs: ResourceAmount[]) {
    const plan = planNearestStorageDeposits(tile.q, tile.r, outputs);
    if (plan.remaining.length > 0) {
        return null;
    }

    const depositedOutputs: ResourceAmount[] = [];

    for (const transfer of plan.transfers) {
        const depositedAmount = depositResourceToStorage(transfer.storageTileId, transfer.resourceType, transfer.amount);
        if (depositedAmount <= 0) {
            return null;
        }

        broadcast({
            type: 'resource:deposit',
            heroId: 'colony',
            storageTileId: transfer.storageTileId,
            resource: {
                type: transfer.resourceType,
                amount: depositedAmount,
            },
        } satisfies ResourceDepositMessage);

        emitGameplayEvent({
            type: 'resource:delivered',
            heroId: 'colony',
            resourceType: transfer.resourceType,
            amount: depositedAmount,
        });

        depositedOutputs.push({
            type: transfer.resourceType,
            amount: depositedAmount,
        });
    }

    return depositedOutputs;
}

function attemptSiteCycle(site: ResolvedJobSite) {
    if (getSiteOperationalBlock(site, site.assignedWorkers)) {
        return;
    }

    const { consumes: scaledInputs, produces: scaledOutputs } = resolveJobResources(site);
    broadcastInputWithdrawals(scaledInputs);
    const depositedOutputs = broadcastOutputDeposits(site.tile, scaledOutputs);
    if (!depositedOutputs) {
        return;
    }

    if (site.building.key === 'mine') {
        const depositedOre = depositedOutputs.reduce((sum, resource) => {
            return resource.type === 'ore' ? sum + resource.amount : sum;
        }, 0);
        extractMineOre(site.tile, depositedOre);
    }
}

function pruneRuntimeState(siteIds: Set<string>) {
    for (const key of siteRuntime.keys()) {
        if (!siteIds.has(key)) {
            siteRuntime.delete(key);
        }
    }
}

function recomputeSnapshot() {
    const sites = listResolvedJobSites();
    assignWorkersEvenly(sites, getAvailableWorkers());
    return createSnapshot(sites, getAvailableWorkers());
}

export function resetJobSiteRuntime(tileId: string) {
    siteRuntime.delete(tileId);
}

export function refreshWorkforceState() {
    const previousSnapshot = getWorkforceSnapshot();
    const nextSnapshot = recomputeSnapshot();
    setWorkforceSnapshot(nextSnapshot);

    if (!snapshotsEqual(previousSnapshot, nextSnapshot)) {
        broadcastWorkforceState();
    }
}

export const jobSystem = {
    name: 'jobs',

    init: () => {
        siteRuntime.clear();
        setWorkforceSnapshot(recomputeSnapshot());
    },

    tick: (ctx: TickContext) => {
        const sites = listResolvedJobSites();
        const availableWorkers = getAvailableWorkers();
        assignWorkersEvenly(sites, availableWorkers);

        const activeSiteIds = new Set(sites.map((site) => site.tile.id));
        pruneRuntimeState(activeSiteIds);

        for (const site of sites) {
            const runtimeState = siteRuntime.get(site.tile.id) ?? {
                nextCycleMs: ctx.now + Math.max(1, site.building.cycleMs ?? 60_000),
                wasAssigned: false,
            };

            siteRuntime.set(site.tile.id, runtimeState);

            if (!isOnlineJobSite(site.tile) || site.assignedWorkers <= 0) {
                runtimeState.wasAssigned = false;
                runtimeState.nextCycleMs = ctx.now + Math.max(1, site.building.cycleMs ?? 60_000);
                continue;
            }

            if (!runtimeState.wasAssigned) {
                runtimeState.wasAssigned = true;
                runtimeState.nextCycleMs = ctx.now + Math.max(1, site.building.cycleMs ?? 60_000);
                continue;
            }

            if (ctx.now < runtimeState.nextCycleMs) {
                continue;
            }

            attemptSiteCycle(site);
            runtimeState.nextCycleMs = ctx.now + Math.max(1, site.building.cycleMs ?? 60_000);
        }

        const previousSnapshot = getWorkforceSnapshot();
        const nextSnapshot = createSnapshot(sites, availableWorkers);
        setWorkforceSnapshot(nextSnapshot);

        if (!snapshotsEqual(previousSnapshot, nextSnapshot)) {
            broadcastWorkforceState();
        }
    },
};

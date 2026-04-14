import {
    getBuildingDefinitionForTile,
    resolveBuildingJobResources,
    type BuildingDefinition,
} from '../../../src/shared/buildings/registry';
import { getBuildingOutputMultiplier } from '../../../src/shared/buildings/state.ts';
import { isJobSiteEnabled } from '../../../src/shared/buildings/jobSites';
import { planNearestStorageDeposits } from '../../../src/shared/buildings/storage';
import type { JobSiteStatus } from '../../../src/shared/game/state/jobStore';
import {
    planResourceWithdrawalsAcrossStorages,
    resourceInventory,
    type StorageResourceTransfer,
} from '../../../src/shared/game/state/resourceStore';
import { isTileActive } from '../../../src/shared/game/state/settlementSupportStore';
import type { ResourceAmount } from '../../../src/shared/game/types/Resource';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { tileIndex } from '../../../src/shared/game/world';
import { extractMineOre, getExtractableMineOre, getMineClusterReserve } from '../state/mineReserveState';

export interface ResolvedJobSite {
    tile: Tile;
    building: BuildingDefinition;
    slots: number;
}

export type SiteOperationalBlock = Extract<JobSiteStatus, 'missing_input' | 'storage_full' | 'depleted'>;

export function isJobBuilding(building: BuildingDefinition | null | undefined): building is BuildingDefinition {
    return !!building
        && (building.jobSlots ?? 0) > 0
        && (building.cycleMs ?? 0) > 0
        && ((building.produces?.length ?? 0) > 0 || typeof building.getJobResources === 'function');
}

export function compareResolvedSites(a: ResolvedJobSite, b: ResolvedJobSite) {
    if (a.building.sortOrder !== b.building.sortOrder) {
        return a.building.sortOrder - b.building.sortOrder;
    }

    return a.tile.id.localeCompare(b.tile.id);
}

export function listResolvedJobSites() {
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
        });
    }

    resolved.sort(compareResolvedSites);
    return resolved;
}

export function isOnlineJobSite(tile: Tile) {
    return tile.discovered
        && !!tile.controlledBySettlementId
        && isTileActive(tile);
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

export function resolveJobResources(site: ResolvedJobSite, assignedWorkers: number = 1) {
    const resolved = resolveBuildingJobResources(site.building, site.tile, assignedWorkers);
    const outputMultiplier = getBuildingOutputMultiplier(site.tile);

    return {
        consumes: resolved.consumes,
        produces: capSiteOutputs(site, resolved.produces.map((resource) => ({
            ...resource,
            amount: Math.max(0, Math.round(resource.amount * outputMultiplier * 100) / 100),
        }))),
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

export function hasStorageCapacity(tile: Tile, inputs: ResourceAmount[], outputs: ResourceAmount[]) {
    if (!outputs.length) {
        return true;
    }

    const freedCapacityByTileId = buildFreedCapacityByTileId(inputs);
    if (freedCapacityByTileId === null) {
        return false;
    }

    return planNearestStorageDeposits(tile.q, tile.r, outputs, freedCapacityByTileId).remaining.length === 0;
}

export function getSiteOperationalBlock(site: ResolvedJobSite, assignedWorkers: number): SiteOperationalBlock | null {
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

export function canAssignWorkersToSite(site: ResolvedJobSite, assignedWorkers: number) {
    if (!isOnlineJobSite(site.tile) || !isJobSiteEnabled(site.tile)) {
        return false;
    }

    const blocked = getSiteOperationalBlock(site, assignedWorkers);
    return blocked !== 'storage_full' && blocked !== 'depleted';
}

export function resolveSiteStatus(site: ResolvedJobSite, assignedWorkers: number): JobSiteStatus {
    if (!isOnlineJobSite(site.tile)) {
        return 'offline';
    }

    if (!isJobSiteEnabled(site.tile)) {
        return 'paused';
    }

    if (assignedWorkers <= 0) {
        const previewBlock = getSiteOperationalBlock(site, Math.min(1, site.slots));
        if (previewBlock === 'storage_full' || previewBlock === 'depleted') {
            return previewBlock;
        }

        return 'unstaffed';
    }

    const operationalBlock = getSiteOperationalBlock(site, assignedWorkers);
    if (operationalBlock) {
        return operationalBlock;
    }

    return 'staffed';
}

export function countTransferredAmount(transfers: StorageResourceTransfer[]) {
    return transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
}

export function finalizeMineExtraction(site: ResolvedJobSite, depositedOutputs: ResourceAmount[]) {
    if (site.building.key !== 'mine') {
        return;
    }

    const depositedOre = depositedOutputs.reduce((sum, resource) => {
        return resource.type === 'ore' ? sum + resource.amount : sum;
    }, 0);

    extractMineOre(site.tile, depositedOre);
}

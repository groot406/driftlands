import {
    getBuildingDefinitionForTile,
    resolveBuildingJobResources,
    type BuildingDefinition,
} from '../../../src/shared/buildings/registry';
import { getBuildingOutputMultiplier } from '../../../src/shared/buildings/state.ts';
import { getTileProductionBoostInputReduction, getVolcanicProductionMultiplier } from '../../../src/shared/game/tileFeatures.ts';
import { isJobSiteEnabled } from '../../../src/shared/buildings/jobSites';
import { planNearestStorageDeposits } from '../../../src/shared/buildings/storage';
import { isBuildingOfflineFromCondition } from '../../../src/shared/buildings/maintenance';
import type { JobSiteStatus } from '../../../src/shared/game/state/jobStore';
import {
    planResourceWithdrawalsAcrossStoragesForSettlement,
    resourceInventory,
    type StorageResourceTransfer,
} from '../../../src/shared/game/state/resourceStore';
import { isTileActive } from '../../../src/shared/game/state/settlementSupportStore';
import { hasActiveStudy } from '../../../src/store/studyStore';
import type { ResourceAmount } from '../../../src/shared/game/types/Resource';
import type { SettlerBlockerReason } from '../../../src/shared/game/types/Settler';
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
        && (
            building.jobKind === 'study'
            || (building.produces?.length ?? 0) > 0
            || typeof building.getJobResources === 'function'
        );
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

function isOperationalJobSite(tile: Tile) {
    return isOnlineJobSite(tile) && !isBuildingOfflineFromCondition(tile);
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
    const outputMultiplier = getBuildingOutputMultiplier(site.tile) * getVolcanicProductionMultiplier(site.tile);
    const inputReduction = getTileProductionBoostInputReduction(site.tile);
    const consumes = resolved.consumes
        .map((resource, index) => ({
            ...resource,
            amount: index === 0 ? Math.max(0, resource.amount - inputReduction) : resource.amount,
        }))
        .filter((resource) => resource.amount > 0);

    return {
        consumes,
        produces: capSiteOutputs(site, resolved.produces.map((resource) => ({
            ...resource,
            amount: Math.max(0, Math.round(resource.amount * outputMultiplier * 100) / 100),
        }))),
    };
}

function hasMissingInputs(resources: ResourceAmount[]) {
    return resources.some((resource) => (resourceInventory[resource.type] ?? 0) < resource.amount);
}

function getMissingInputReason(resources: ResourceAmount[], tileId: string): SettlerBlockerReason | null {
    const missing = resources.find((resource) => (resourceInventory[resource.type] ?? 0) < resource.amount);
    if (!missing) {
        return null;
    }

    return {
        code: 'missing_input',
        resourceType: missing.type,
        amount: Math.max(0, missing.amount - (resourceInventory[missing.type] ?? 0)),
        tileId,
    };
}

function buildFreedCapacityByTileId(resources: ResourceAmount[]) {
    const freedCapacityByTileId = new Map<string, number>();

    for (const resource of resources) {
        const plannedTransfers = planResourceWithdrawalsAcrossStoragesForSettlement(tile.ownerSettlementId ?? tile.controlledBySettlementId ?? null, resource.type, resource.amount);
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

    const settlementId = tile.ownerSettlementId ?? tile.controlledBySettlementId ?? null;
    return planNearestStorageDeposits(tile.q, tile.r, settlementId, outputs, freedCapacityByTileId).remaining.length === 0;
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

export function getSiteBlockerReason(site: ResolvedJobSite, assignedWorkers: number): SettlerBlockerReason | null {
    if (!isOperationalJobSite(site.tile)) {
        return {
            code: 'site_offline',
            tileId: site.tile.id,
        };
    }

    if (!isJobSiteEnabled(site.tile)) {
        return {
            code: 'site_paused',
            tileId: site.tile.id,
        };
    }

    if (site.building.jobKind === 'study' && !hasActiveStudy()) {
        return {
            code: 'no_work',
            tileId: site.tile.id,
        };
    }

    if (assignedWorkers <= 0) {
        return null;
    }

    if (site.building.key === 'mine' && getMineClusterReserve(site.tile).totalRemaining <= 0) {
        return {
            code: 'resource_depleted',
            resourceType: 'ore',
            tileId: site.tile.id,
        };
    }

    const { consumes: scaledInputs, produces: scaledOutputs } = resolveJobResources(site, assignedWorkers);
    const missingInput = getMissingInputReason(scaledInputs, site.tile.id);
    if (missingInput) {
        return missingInput;
    }

    if (!hasStorageCapacity(site.tile, scaledInputs, scaledOutputs)) {
        return {
            code: 'storage_full',
            resourceType: scaledOutputs[0]?.type,
            amount: scaledOutputs[0]?.amount,
            tileId: site.tile.id,
        };
    }

    return null;
}

export function canAssignWorkersToSite(site: ResolvedJobSite, assignedWorkers: number) {
    if (!isOperationalJobSite(site.tile) || !isJobSiteEnabled(site.tile)) {
        return false;
    }

    if (site.building.jobKind === 'study' && !hasActiveStudy()) {
        return false;
    }

    const blocked = getSiteOperationalBlock(site, assignedWorkers);
    return blocked !== 'storage_full' && blocked !== 'depleted';
}

export function resolveSiteStatus(site: ResolvedJobSite, assignedWorkers: number): JobSiteStatus {
    if (!isOperationalJobSite(site.tile)) {
        return 'offline';
    }

    if (!isJobSiteEnabled(site.tile)) {
        return 'paused';
    }

    if (site.building.jobKind === 'study' && !hasActiveStudy()) {
        return 'complete';
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

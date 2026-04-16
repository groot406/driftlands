import type { ResourceType } from '../../core/types/Resource.ts';
import type { Settler } from '../../core/types/Settler.ts';
import type { Tile, TileConditionState } from '../../core/types/Tile.ts';
import { getBuildingDefinitionForTile } from './registry.ts';
import {
    REPAIR_RESTORE_AMOUNT,
    getRepairPriority,
    getRepairNeededAmount,
    getTileConditionState,
    getTileRepairResources,
    isMaintainedBuildingTile,
} from './maintenance.ts';

export interface MaintenanceBacklogResource {
    type: ResourceType;
    amount: number;
    available: number;
    shortfall: number;
}

export interface MaintenanceSiteSummary {
    tileId: string;
    label: string;
    condition: number;
    conditionState: TileConditionState;
    repairNeeded: number;
    repairCyclesNeeded: number;
}

export interface MaintenanceOverview {
    maintainedCount: number;
    healthyCount: number;
    wornCount: number;
    damagedCount: number;
    offlineCount: number;
    needsRepairCount: number;
    averageCondition: number;
    assignedRepairers: number;
    repairingNow: number;
    crewDemand: number;
    uncoveredTargets: number;
    backlogCycles: number;
    backlogResources: MaintenanceBacklogResource[];
    urgentSites: MaintenanceSiteSummary[];
    tone: 'ok' | 'warn' | 'danger';
    statusText: string;
}

export function getConditionTone(conditionState: TileConditionState): 'ok' | 'warn' | 'danger' {
    switch (conditionState) {
        case 'offline':
        case 'damaged':
            return 'danger';
        case 'worn':
            return 'warn';
        case 'healthy':
        default:
            return 'ok';
    }
}

export function getConditionLabel(conditionState: TileConditionState) {
    switch (conditionState) {
        case 'offline':
            return 'Offline';
        case 'damaged':
            return 'Damaged';
        case 'worn':
            return 'Worn';
        case 'healthy':
        default:
            return 'Healthy';
    }
}

export function getConditionStatusText(conditionState: TileConditionState) {
    switch (conditionState) {
        case 'offline':
            return 'Offline until repaired';
        case 'damaged':
            return 'Severely degraded and close to shutting down';
        case 'worn':
            return 'Running, but repairs are due soon';
        case 'healthy':
        default:
            return 'Operational and in good shape';
    }
}

export function getMaintenanceOverview(
    tiles: Tile[],
    settlers: Settler[],
    resourceInventory: Partial<Record<ResourceType, number>>,
): MaintenanceOverview {
    const maintainedTiles = tiles.filter((tile) => isMaintainedBuildingTile(tile));
    const repairTargets = maintainedTiles
        .filter((tile) => getRepairNeededAmount(tile) > 0)
        .sort((a, b) => {
            const priorityDelta = getRepairPriority(b) - getRepairPriority(a);
            if (priorityDelta !== 0) {
                return priorityDelta;
            }
            return a.id.localeCompare(b.id);
        });
    const assignedRepairers = settlers.filter((settler) => settler.assignedRole === 'repair').length;
    const repairingNow = settlers.filter((settler) => settler.activity === 'repairing').length;

    let healthyCount = 0;
    let wornCount = 0;
    let damagedCount = 0;
    let offlineCount = 0;
    let totalCondition = 0;
    let backlogCycles = 0;
    const backlogByResource = new Map<ResourceType, number>();

    for (const tile of maintainedTiles) {
        const conditionState = getTileConditionState(tile.condition);
        totalCondition += tile.condition ?? 100;

        if (conditionState === 'offline') {
            offlineCount++;
        } else if (conditionState === 'damaged') {
            damagedCount++;
        } else if (conditionState === 'worn') {
            wornCount++;
        } else {
            healthyCount++;
        }

        const repairNeeded = getRepairNeededAmount(tile);
        if (repairNeeded <= 0) {
            continue;
        }

        const repairCyclesNeeded = Math.ceil(repairNeeded / REPAIR_RESTORE_AMOUNT);
        backlogCycles += repairCyclesNeeded;
        for (const resource of getTileRepairResources(tile)) {
            backlogByResource.set(
                resource.type,
                (backlogByResource.get(resource.type) ?? 0) + (resource.amount * repairCyclesNeeded),
            );
        }
    }

    const backlogResources = Array.from(backlogByResource.entries())
        .map(([type, amount]) => {
            const available = Math.max(0, resourceInventory[type] ?? 0);
            return {
                type,
                amount,
                available,
                shortfall: Math.max(0, amount - available),
            };
        })
        .sort((a, b) => {
            if (b.shortfall !== a.shortfall) {
                return b.shortfall - a.shortfall;
            }
            if (b.amount !== a.amount) {
                return b.amount - a.amount;
            }
            return a.type.localeCompare(b.type);
        });

    const urgentSites = repairTargets.slice(0, 3).map((tile) => ({
        tileId: tile.id,
        label: getBuildingDefinitionForTile(tile)?.label ?? tile.terrain ?? 'Building',
        condition: tile.condition ?? 100,
        conditionState: getTileConditionState(tile.condition),
        repairNeeded: getRepairNeededAmount(tile),
        repairCyclesNeeded: Math.ceil(getRepairNeededAmount(tile) / REPAIR_RESTORE_AMOUNT),
    }));

    const needsRepairCount = repairTargets.length;
    const crewDemand = needsRepairCount;
    const uncoveredTargets = Math.max(0, crewDemand - assignedRepairers);
    const averageCondition = maintainedTiles.length > 0
        ? Math.round(totalCondition / maintainedTiles.length)
        : 100;

    let tone: MaintenanceOverview['tone'] = 'ok';
    let statusText = 'All maintained buildings are operational.';
    if (offlineCount > 0) {
        tone = 'danger';
        statusText = `${offlineCount} building${offlineCount === 1 ? '' : 's'} offline for repairs.`;
    } else if (damagedCount > 0) {
        tone = 'danger';
        statusText = `${damagedCount} building${damagedCount === 1 ? '' : 's'} badly damaged and at risk.`;
    } else if (wornCount > 0) {
        tone = 'warn';
        statusText = `${wornCount} building${wornCount === 1 ? '' : 's'} need maintenance soon.`;
    }

    return {
        maintainedCount: maintainedTiles.length,
        healthyCount,
        wornCount,
        damagedCount,
        offlineCount,
        needsRepairCount,
        averageCondition,
        assignedRepairers,
        repairingNow,
        crewDemand,
        uncoveredTargets,
        backlogCycles,
        backlogResources,
        urgentSites,
        tone,
        statusText,
    };
}

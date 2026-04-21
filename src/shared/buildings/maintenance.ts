import type { ResourceAmount } from '../../core/types/Resource.ts';
import type { Tile, TileConditionState } from '../../core/types/Tile.ts';
import { getBuildingDefinitionForTile } from './registry.ts';
import { tileIndex } from '../game/world.ts';

export const MAX_BUILDING_CONDITION = 100;
export const WORN_CONDITION_THRESHOLD = 65;
export const DAMAGED_CONDITION_THRESHOLD = 35;
export const OFFLINE_CONDITION_THRESHOLD = 15;
export const REPAIR_DISPATCH_THRESHOLD = 10;
export const REPAIR_RESTORE_AMOUNT = 35;
export const REPAIR_CYCLE_MS = 30_000;
export const MAINTENANCE_DECAY_RATE_MULTIPLIER = 0.6;

export function clampBuildingCondition(value: number | null | undefined) {
    if (!Number.isFinite(value)) {
        return MAX_BUILDING_CONDITION;
    }

    return Math.max(0, Math.min(MAX_BUILDING_CONDITION, value ?? MAX_BUILDING_CONDITION));
}

export function getTileConditionState(condition: number | null | undefined): TileConditionState {
    const clamped = clampBuildingCondition(condition);
    if (clamped <= OFFLINE_CONDITION_THRESHOLD) {
        return 'offline';
    }
    if (clamped <= DAMAGED_CONDITION_THRESHOLD) {
        return 'damaged';
    }
    if (clamped <= WORN_CONDITION_THRESHOLD) {
        return 'worn';
    }
    return 'healthy';
}

export function isMaintainedBuildingTile(tile: Tile | null | undefined) {
    const building = getBuildingDefinitionForTile(tile);
    return !!building?.maintenanceDecayPerMinute && !!building?.repairResources?.length;
}

export function getTileRepairResources(tile: Tile | null | undefined): ResourceAmount[] {
    const building = getBuildingDefinitionForTile(tile);
    return building?.repairResources?.map((resource) => ({ ...resource })) ?? [];
}

export function getTileMaintenanceDecayPerMinute(tile: Tile | null | undefined) {
    return (getBuildingDefinitionForTile(tile)?.maintenanceDecayPerMinute ?? 0) * MAINTENANCE_DECAY_RATE_MULTIPLIER;
}

export function getTileJobPresentation(tile: Tile | null | undefined) {
    return getBuildingDefinitionForTile(tile)?.jobPresentation ?? 'outdoor';
}

export function initializeBuildingCondition(tile: Tile | null | undefined, now: number = Date.now()) {
    if (!tile || !isMaintainedBuildingTile(tile)) {
        return;
    }

    if (tile.condition == null || !Number.isFinite(tile.condition)) {
        tile.condition = MAX_BUILDING_CONDITION;
    } else {
        tile.condition = clampBuildingCondition(tile.condition);
    }

    tile.conditionState = getTileConditionState(tile.condition);
    tile.lastConditionUpdateMs ??= now;
}

export function updateTileCondition(tile: Tile | null | undefined, nextCondition: number, now: number = Date.now()) {
    if (!tile || !isMaintainedBuildingTile(tile)) {
        return false;
    }

    const previousCondition = clampBuildingCondition(tile.condition);
    const previousRounded = Math.round(previousCondition);
    const previousState = getTileConditionState(previousCondition);
    const clamped = clampBuildingCondition(nextCondition);
    const nextState = getTileConditionState(clamped);
    const changed = previousRounded !== Math.round(clamped)
        || previousState !== nextState
        || tile.condition == null
        || tile.conditionState == null;

    tile.condition = clamped;
    tile.conditionState = nextState;
    tile.lastConditionUpdateMs = now;
    return changed;
}

export function isBuildingOfflineFromCondition(tile: Tile | null | undefined) {
    return isMaintainedBuildingTile(tile) && getTileConditionState(tile?.condition) === 'offline';
}

export function getRepairNeededAmount(tile: Tile | null | undefined) {
    if (!isMaintainedBuildingTile(tile)) {
        return 0;
    }

    return Math.max(0, MAX_BUILDING_CONDITION - clampBuildingCondition(tile?.condition));
}

export function getRepairPriority(tile: Tile | null | undefined) {
    if (!isMaintainedBuildingTile(tile)) {
        return Number.NEGATIVE_INFINITY;
    }

    const state = getTileConditionState(tile?.condition);
    const basePriority = state === 'offline' ? 300
        : state === 'damaged' ? 200
            : state === 'worn' ? 100
                : 0;
    return basePriority + getRepairNeededAmount(tile);
}

export function listRepairTargets() {
    return Object.values(tileIndex)
        .filter((tile): tile is Tile => isMaintainedBuildingTile(tile))
        .filter((tile) => getRepairNeededAmount(tile) >= REPAIR_DISPATCH_THRESHOLD || getTileConditionState(tile.condition) === 'offline')
        .sort((a, b) => {
            const priorityDelta = getRepairPriority(b) - getRepairPriority(a);
            if (priorityDelta !== 0) {
                return priorityDelta;
            }
            return a.id.localeCompare(b.id);
        });
}

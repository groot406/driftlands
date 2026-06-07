import { getVariantSet, terrainPositions } from '../../core/terrainRegistry';
import type { Tile } from '../../core/types/Tile';
import type { ResourceType } from '../../core/types/Resource.ts';
import { axialDistanceCoords } from '../game/hex';
import { canStorageKindStoreResource, type StorageKind } from '../game/storage.ts';
import { isTileWalkable } from '../game/navigation';
import { isTileInSettlement } from '../game/settlement';
import { tileIndex } from '../game/world';
import { depositResourceToStorage, getStorageFreeCapacity, getStorageResourceAmount } from '../../store/resourceStore';
import { listBuildingDefinitions } from './registry';
import { getStorageKindForBuildingTile } from './state.ts';
import { isTileActive } from '../game/state/settlementSupportStore';
import { isBuildingOfflineFromCondition } from './maintenance.ts';

export function getStorageKindForTile(tile: Tile | null | undefined): StorageKind | null {
    if (!tile) {
        return null;
    }

    if (tile.terrain === 'towncenter') {
        return 'towncenter';
    }

    return getStorageKindForBuildingTile(tile);
}

export function isWarehouseBuildingTile(tile: Tile | null | undefined) {
    return !!getStorageKindForTile(tile);
}

interface WarehouseUseOptions {
    allowInactive?: boolean;
}

export function canUseWarehouseAtTile(tile: Tile | null | undefined, options: WarehouseUseOptions = {}) {
    if (!tile?.discovered || !isTileWalkable(tile) || (!options.allowInactive && !isTileActive(tile)) || isBuildingOfflineFromCondition(tile)) {
        return false;
    }

    return !!getStorageKindForTile(tile);
}

function belongsToSettlement(tile: Tile | null | undefined, settlementId: string | null | undefined) {
    if (!tile || !settlementId) {
        return !settlementId;
    }

    return isTileInSettlement(tile, settlementId);
}

function findNearestStorageTile(
    q: number,
    r: number,
    settlementId: string | null | undefined = null,
    predicate?: (tile: Tile) => boolean,
    excludedTileIds: Set<string> = new Set(),
    options: WarehouseUseOptions = {},
): Tile | null {
    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    const considerTile = (tile: Tile | null | undefined) => {
        if (!tile || excludedTileIds.has(tile.id) || !canUseWarehouseAtTile(tile, options)) {
            return;
        }

        if (settlementId && !belongsToSettlement(tile, settlementId)) {
            return;
        }

        if (predicate && !predicate(tile)) {
            return;
        }

        const distance = axialDistanceCoords(q, r, tile.q, tile.r);
        if (distance < bestDistance) {
            best = tile;
            bestDistance = distance;
        }
    };

    for (const tileId of terrainPositions.towncenter) {
        considerTile(tileIndex[tileId]);
    }

    for (const building of listBuildingDefinitions()) {
        if (!building.providesWarehouse) continue;

        for (const variantKey of building.variantKeys) {
            for (const tileId of getVariantSet(variantKey)) {
                considerTile(tileIndex[tileId]);
            }
        }
    }

    return best;
}

export function findNearestWarehouseAccessTile(q: number, r: number, settlementId: string | null | undefined = null): Tile | null {
    return findNearestStorageTile(q, r, settlementId);
}

export function findNearestWarehouseWithResource(
    q: number,
    r: number,
    settlementId: string | null | undefined,
    resourceType: ResourceType,
    requiredAmount: number = 1,
    excludeTileIds: Iterable<string> = [],
    options: WarehouseUseOptions = {},
): Tile | null {
    const excluded = new Set(excludeTileIds);

    return (
        findNearestStorageTile(q, r, settlementId, (tile) => getStorageResourceAmount(tile.id, resourceType) >= requiredAmount, excluded, options)
        ?? findNearestStorageTile(q, r, settlementId, (tile) => getStorageResourceAmount(tile.id, resourceType) > 0, excluded, options)
    );
}

export function findNearestWarehouseWithCapacity(
    q: number,
    r: number,
    settlementId: string | null | undefined,
    requiredFreeCapacity: number = 1,
    excludeTileIds: Iterable<string> = [],
): Tile | null {
    const excluded = new Set(excludeTileIds);

    return findNearestWarehouseWithCapacityForResource(q, r, settlementId, null, requiredFreeCapacity, excluded);
}

export function findNearestWarehouseWithCapacityForResource(
    q: number,
    r: number,
    settlementId: string | null | undefined,
    resourceType: ResourceType | null,
    requiredFreeCapacity: number = 1,
    excludeTileIds: Iterable<string> = [],
): Tile | null {
    const excluded = new Set(excludeTileIds);
    const canStore = (tile: Tile) => {
        const kind = getStorageKindForTile(tile);
        return !!kind && (!resourceType || canStorageKindStoreResource(kind, resourceType));
    };

    return (
        findNearestStorageTile(q, r, settlementId, (tile) => canStore(tile) && getStorageFreeCapacity(tile.id) >= requiredFreeCapacity, excluded)
        ?? findNearestStorageTile(q, r, settlementId, (tile) => canStore(tile) && getStorageFreeCapacity(tile.id) > 0, excluded)
    );
}

export interface StorageDepositTransfer {
    storageTileId: string;
    amount: number;
}

export interface PlannedStorageDepositTransfer extends StorageDepositTransfer {
    resourceType: ResourceType;
}

function listUsableStorageTiles(options: WarehouseUseOptions = {}) {
    const candidates = new Map<string, Tile>();

    const considerTile = (tile: Tile | null | undefined) => {
        if (!tile || !canUseWarehouseAtTile(tile, options)) {
            return;
        }

        candidates.set(tile.id, tile);
    };

    for (const tileId of terrainPositions.towncenter) {
        considerTile(tileIndex[tileId]);
    }

    for (const building of listBuildingDefinitions()) {
        if (!building.providesWarehouse) continue;

        for (const variantKey of building.variantKeys) {
            for (const tileId of getVariantSet(variantKey)) {
                considerTile(tileIndex[tileId]);
            }
        }
    }

    return Array.from(candidates.values());
}

export function listUsableStorageTilesForSettlement(
    settlementId: string | null | undefined = null,
    options: WarehouseUseOptions = {},
) {
    return listUsableStorageTiles(options).filter((tile) => belongsToSettlement(tile, settlementId));
}

export function compareStorageDistance(q: number, r: number, a: Tile, b: Tile) {
    const distanceA = axialDistanceCoords(q, r, a.q, a.r);
    const distanceB = axialDistanceCoords(q, r, b.q, b.r);
    if (distanceA !== distanceB) {
        return distanceA - distanceB;
    }

    const kindA = getStorageKindForTile(a) === 'towncenter' ? 0 : 1;
    const kindB = getStorageKindForTile(b) === 'towncenter' ? 0 : 1;
    if (kindA !== kindB) {
        return kindA - kindB;
    }

    return a.id.localeCompare(b.id);
}

export function listUsableWarehousesWithResource(
    q: number,
    r: number,
    settlementId: string | null | undefined,
    resourceType: ResourceType,
    requiredAmount: number = 1,
    options: WarehouseUseOptions = {},
): Tile[] {
    const strongMatches: Tile[] = [];
    const partialMatches: Tile[] = [];

    for (const tile of listUsableStorageTilesForSettlement(settlementId, options)) {
        if (!canUseWarehouseAtTile(tile, options)) {
            continue;
        }

        const amount = getStorageResourceAmount(tile.id, resourceType);
        if (amount >= requiredAmount) {
            strongMatches.push(tile);
        } else if (amount > 0) {
            partialMatches.push(tile);
        }
    }

    const compare = (a: Tile, b: Tile) => compareStorageDistance(q, r, a, b);
    return strongMatches.length > 0
        ? strongMatches.sort(compare)
        : partialMatches.sort(compare);
}

export function listUsableWarehousesWithCapacityForResource(
    q: number,
    r: number,
    settlementId: string | null | undefined,
    resourceType: ResourceType | null,
    requiredFreeCapacity: number = 1,
): Tile[] {
    const strongMatches: Tile[] = [];
    const partialMatches: Tile[] = [];

    for (const tile of listUsableStorageTilesForSettlement(settlementId)) {
        const kind = getStorageKindForTile(tile);
        if (!kind || (resourceType && !canStorageKindStoreResource(kind, resourceType))) {
            continue;
        }

        const freeCapacity = getStorageFreeCapacity(tile.id);
        if (freeCapacity >= requiredFreeCapacity) {
            strongMatches.push(tile);
        } else if (freeCapacity > 0) {
            partialMatches.push(tile);
        }
    }

    const compare = (a: Tile, b: Tile) => compareStorageDistance(q, r, a, b);
    return strongMatches.length > 0
        ? strongMatches.sort(compare)
        : partialMatches.sort(compare);
}

export function depositResourceIntoNearestStorages(
    q: number,
    r: number,
    settlementId: string | null | undefined,
    resourceType: ResourceType,
    amount: number,
): { transfers: StorageDepositTransfer[]; remaining: number } {
    const transfers: StorageDepositTransfer[] = [];
    const excluded = new Set<string>();
    let remaining = Math.max(0, amount);

    while (remaining > 0) {
        const storageTile = findNearestWarehouseWithCapacityForResource(q, r, settlementId, resourceType, remaining, excluded);
        if (!storageTile) {
            break;
        }

        const depositedAmount = depositResourceToStorage(storageTile.id, resourceType, remaining);
        if (depositedAmount <= 0) {
            excluded.add(storageTile.id);
            continue;
        }

        transfers.push({
            storageTileId: storageTile.id,
            amount: depositedAmount,
        });
        remaining -= depositedAmount;

        if (getStorageFreeCapacity(storageTile.id) <= 0) {
            excluded.add(storageTile.id);
        }
    }

    return {
        transfers,
        remaining,
    };
}

export function planNearestStorageDeposits(
    q: number,
    r: number,
    settlementId: string | null | undefined,
    resources: Array<{ type: ResourceType; amount: number }>,
    freeCapacityOverrides?: Map<string, number>,
) {
    const transfers: PlannedStorageDepositTransfer[] = [];
    const remaining: Array<{ type: ResourceType; amount: number }> = [];
    const storageTiles = listUsableStorageTilesForSettlement(settlementId).sort((a, b) => compareStorageDistance(q, r, a, b));
    const freeCapacityByTileId = new Map<string, number>();
    for (const tile of storageTiles) {
        const baseFreeCapacity = getStorageFreeCapacity(tile.id);
        freeCapacityByTileId.set(
            tile.id,
            baseFreeCapacity + (freeCapacityOverrides?.get(tile.id) ?? 0),
        );
    }

    for (const resource of resources) {
        let amountLeft = Math.max(0, resource.amount);
        if (amountLeft <= 0) {
            continue;
        }

        for (const tile of storageTiles) {
            if (amountLeft <= 0) {
                break;
            }
            const kind = getStorageKindForTile(tile);
            if (!kind || !canStorageKindStoreResource(kind, resource.type)) {
                continue;
            }

            const freeCapacity = freeCapacityByTileId.get(tile.id) ?? 0;
            if (freeCapacity <= 0) {
                continue;
            }

            const amountToStore = Math.min(amountLeft, freeCapacity);
            if (amountToStore <= 0) {
                continue;
            }

            transfers.push({
                storageTileId: tile.id,
                resourceType: resource.type,
                amount: amountToStore,
            });
            freeCapacityByTileId.set(tile.id, freeCapacity - amountToStore);
            amountLeft -= amountToStore;
        }

        if (amountLeft > 0) {
            remaining.push({
                type: resource.type,
                amount: amountLeft,
            });
        }
    }

    return {
        transfers,
        remaining,
    };
}

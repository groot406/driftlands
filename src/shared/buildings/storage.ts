import { getVariantSet, terrainPositions } from '../../core/terrainRegistry';
import type { Tile } from '../../core/types/Tile';
import type { ResourceType } from '../../core/types/Resource.ts';
import { axialDistanceCoords } from '../game/hex';
import type { StorageKind } from '../game/storage.ts';
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
    const kind = getStorageKindForTile(tile);
    return kind === 'warehouse' || kind === 'depot';
}

export function canUseWarehouseAtTile(tile: Tile | null | undefined) {
    if (!tile?.discovered || !isTileWalkable(tile) || !isTileActive(tile) || isBuildingOfflineFromCondition(tile)) {
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
): Tile | null {
    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    const considerTile = (tile: Tile | null | undefined) => {
        if (!tile || excludedTileIds.has(tile.id) || !canUseWarehouseAtTile(tile)) {
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
): Tile | null {
    const excluded = new Set(excludeTileIds);

    return (
        findNearestStorageTile(q, r, settlementId, (tile) => getStorageResourceAmount(tile.id, resourceType) >= requiredAmount, excluded)
        ?? findNearestStorageTile(q, r, settlementId, (tile) => getStorageResourceAmount(tile.id, resourceType) > 0, excluded)
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

    return (
        findNearestStorageTile(q, r, settlementId, (tile) => getStorageFreeCapacity(tile.id) >= requiredFreeCapacity, excluded)
        ?? findNearestStorageTile(q, r, settlementId, (tile) => getStorageFreeCapacity(tile.id) > 0, excluded)
    );
}

export interface StorageDepositTransfer {
    storageTileId: string;
    amount: number;
}

export interface PlannedStorageDepositTransfer extends StorageDepositTransfer {
    resourceType: ResourceType;
}

function listUsableStorageTiles() {
    const candidates = new Map<string, Tile>();

    const considerTile = (tile: Tile | null | undefined) => {
        if (!tile || !canUseWarehouseAtTile(tile)) {
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

function listUsableStorageTilesForSettlement(settlementId: string | null | undefined = null) {
    return listUsableStorageTiles().filter((tile) => belongsToSettlement(tile, settlementId));
}

function compareStorageDistance(q: number, r: number, a: Tile, b: Tile) {
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
        const storageTile = findNearestWarehouseWithCapacity(q, r, settlementId, remaining, excluded);
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

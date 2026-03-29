import { getVariantSet, terrainPositions } from '../../core/terrainRegistry';
import type { Tile } from '../../core/types/Tile';
import type { ResourceType } from '../../core/types/Resource.ts';
import { axialDistanceCoords } from '../game/hex';
import type { StorageKind } from '../game/storage.ts';
import { isTileWalkable } from '../game/navigation';
import { tileIndex } from '../game/world';
import { depositResourceToStorage, getStorageFreeCapacity, getStorageResourceAmount } from '../../store/resourceStore';
import { getBuildingDefinitionForTile, listBuildingDefinitions } from './registry';

export function getStorageKindForTile(tile: Tile | null | undefined): StorageKind | null {
    if (!tile) {
        return null;
    }

    if (tile.terrain === 'towncenter') {
        return 'towncenter';
    }

    const building = getBuildingDefinitionForTile(tile);
    if (!building?.providesWarehouse) {
        return null;
    }

    return building.key === 'supplyDepot' ? 'depot' : 'warehouse';
}

export function isWarehouseBuildingTile(tile: Tile | null | undefined) {
    const kind = getStorageKindForTile(tile);
    return kind === 'warehouse' || kind === 'depot';
}

export function canUseWarehouseAtTile(tile: Tile | null | undefined) {
    if (!tile?.discovered || !isTileWalkable(tile)) {
        return false;
    }

    return !!getStorageKindForTile(tile);
}

function findNearestStorageTile(
    q: number,
    r: number,
    predicate?: (tile: Tile) => boolean,
    excludedTileIds: Set<string> = new Set(),
): Tile | null {
    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    const considerTile = (tile: Tile | null | undefined) => {
        if (!tile || excludedTileIds.has(tile.id) || !canUseWarehouseAtTile(tile)) {
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

export function findNearestWarehouseAccessTile(q: number, r: number): Tile | null {
    return findNearestStorageTile(q, r);
}

export function findNearestWarehouseWithResource(
    q: number,
    r: number,
    resourceType: ResourceType,
    requiredAmount: number = 1,
    excludeTileIds: Iterable<string> = [],
): Tile | null {
    const excluded = new Set(excludeTileIds);

    return (
        findNearestStorageTile(q, r, (tile) => getStorageResourceAmount(tile.id, resourceType) >= requiredAmount, excluded)
        ?? findNearestStorageTile(q, r, (tile) => getStorageResourceAmount(tile.id, resourceType) > 0, excluded)
    );
}

export function findNearestWarehouseWithCapacity(
    q: number,
    r: number,
    requiredFreeCapacity: number = 1,
    excludeTileIds: Iterable<string> = [],
): Tile | null {
    const excluded = new Set(excludeTileIds);

    return (
        findNearestStorageTile(q, r, (tile) => getStorageFreeCapacity(tile.id) >= requiredFreeCapacity, excluded)
        ?? findNearestStorageTile(q, r, (tile) => getStorageFreeCapacity(tile.id) > 0, excluded)
    );
}

export interface StorageDepositTransfer {
    storageTileId: string;
    amount: number;
}

export function depositResourceIntoNearestStorages(
    q: number,
    r: number,
    resourceType: ResourceType,
    amount: number,
): { transfers: StorageDepositTransfer[]; remaining: number } {
    const transfers: StorageDepositTransfer[] = [];
    const excluded = new Set<string>();
    let remaining = Math.max(0, amount);

    while (remaining > 0) {
        const storageTile = findNearestWarehouseWithCapacity(q, r, remaining, excluded);
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

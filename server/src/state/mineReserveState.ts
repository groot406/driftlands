import type { Tile } from '../../../src/shared/game/types/Tile.ts';
import { MINE_ORE_PER_MOUNTAIN_TILE, listMountainClusterTiles } from '../../../src/shared/buildings/mine.ts';

const extractedOreByMountainTileId = new Map<string, number>();

function getExtractedOre(tileId: string) {
    return extractedOreByMountainTileId.get(tileId) ?? 0;
}

function getRemainingOre(tileId: string) {
    return Math.max(0, MINE_ORE_PER_MOUNTAIN_TILE - getExtractedOre(tileId));
}

export function resetMineReserveState() {
    extractedOreByMountainTileId.clear();
}

export function getMineClusterReserve(tile: Tile | null | undefined) {
    const clusterTiles = listMountainClusterTiles(tile);
    const totalCapacity = clusterTiles.length * MINE_ORE_PER_MOUNTAIN_TILE;
    const totalRemaining = clusterTiles.reduce((sum, clusterTile) => sum + getRemainingOre(clusterTile.id), 0);

    return {
        clusterTiles,
        totalCapacity,
        totalRemaining,
    };
}

export function getExtractableMineOre(tile: Tile | null | undefined, requestedAmount: number) {
    if (requestedAmount <= 0) {
        return 0;
    }

    return Math.min(requestedAmount, getMineClusterReserve(tile).totalRemaining);
}

export function extractMineOre(tile: Tile | null | undefined, requestedAmount: number) {
    if (requestedAmount <= 0) {
        return 0;
    }

    const clusterTiles = listMountainClusterTiles(tile);
    if (!clusterTiles.length) {
        return 0;
    }

    let remainingToExtract = requestedAmount;
    let extracted = 0;

    // Drain one unit per mountain at a time so mines on the same range share it predictably.
    while (remainingToExtract > 0) {
        let extractedThisPass = 0;

        for (const clusterTile of clusterTiles) {
            if (remainingToExtract <= 0) {
                break;
            }

            if (getRemainingOre(clusterTile.id) <= 0) {
                continue;
            }

            extractedOreByMountainTileId.set(clusterTile.id, getExtractedOre(clusterTile.id) + 1);
            remainingToExtract -= 1;
            extracted += 1;
            extractedThisPass += 1;
        }

        if (extractedThisPass <= 0) {
            break;
        }
    }

    return extracted;
}

import type { Tile } from '../../../src/shared/game/types/Tile.ts';
import { getMineClusterOreCapacity, listMountainClusterTiles } from '../../../src/shared/buildings/mine.ts';

const extractedOreByMountainTileId = new Map<string, number>();

function getExtractedOre(tileId: string) {
    return extractedOreByMountainTileId.get(tileId) ?? 0;
}

export function resetMineReserveState() {
    extractedOreByMountainTileId.clear();
}

export function getMineClusterReserve(tile: Tile | null | undefined) {
    const clusterTiles = listMountainClusterTiles(tile);
    const totalCapacity = getMineClusterOreCapacity(clusterTiles.length);
    const totalExtracted = clusterTiles.reduce((sum, clusterTile) => sum + getExtractedOre(clusterTile.id), 0);
    const totalRemaining = Math.max(0, totalCapacity - totalExtracted);

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

    const { clusterTiles, totalRemaining } = getMineClusterReserve(tile);
    if (!clusterTiles.length) {
        return 0;
    }

    let remainingToExtract = Math.min(requestedAmount, totalRemaining);
    let extracted = 0;

    // Drain one unit per mountain at a time so mines on the same range share the pooled reserve predictably.
    while (remainingToExtract > 0) {
        for (const clusterTile of clusterTiles) {
            if (remainingToExtract <= 0) {
                break;
            }

            extractedOreByMountainTileId.set(clusterTile.id, getExtractedOre(clusterTile.id) + 1);
            remainingToExtract -= 1;
            extracted += 1;
        }
    }

    return extracted;
}

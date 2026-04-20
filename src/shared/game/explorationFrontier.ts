import { SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile';
import { tileIndex } from './world';

const SIDE_DELTAS: Record<TileSide, readonly [number, number]> = {
    a: [0, -1],
    b: [1, -1],
    c: [1, 0],
    d: [0, 1],
    e: [-1, 1],
    f: [-1, 0],
};

function getNeighbor(tile: Tile, side: TileSide) {
    const [dq, dr] = SIDE_DELTAS[side];
    return tile.neighbors?.[side] ?? tileIndex[`${tile.q + dq},${tile.r + dr}`] ?? null;
}

export function isUndiscoveredFrontierTile(tile: Tile | null | undefined) {
    if (!tile || tile.discovered) {
        return false;
    }

    return SIDE_NAMES.some((side) => getNeighbor(tile, side)?.discovered === true);
}

export function isScoutingFrontierTile(tile: Tile | null | undefined) {
    if (!tile || tile.discovered || tile.scouted) {
        return false;
    }

    return SIDE_NAMES.some((side) => {
        const neighbor = getNeighbor(tile, side);
        return neighbor?.discovered === true || neighbor?.scouted === true;
    });
}

export function isVisibleExplorationTile(tile: Tile | null | undefined) {
    return !!tile && (tile.discovered || tile.scouted || isUndiscoveredFrontierTile(tile) || isScoutingFrontierTile(tile));
}

export function listUndiscoveredFrontierTiles() {
    const frontierIds = new Set<string>();

    for (const tile of Object.values(tileIndex)) {
        if (!tile.discovered) {
            continue;
        }

        for (const side of SIDE_NAMES) {
            const neighbor = getNeighbor(tile, side);
            if (neighbor && !neighbor.discovered) {
                frontierIds.add(neighbor.id);
            }
        }
    }

    return Array.from(frontierIds)
        .map((tileId) => tileIndex[tileId])
        .filter((tile): tile is Tile => !!tile)
        .sort((a, b) => a.id.localeCompare(b.id));
}

export function listScoutingFrontierTiles() {
    const frontierIds = new Set<string>();

    for (const tile of Object.values(tileIndex)) {
        if (!tile.discovered && !tile.scouted) {
            continue;
        }

        for (const side of SIDE_NAMES) {
            const neighbor = getNeighbor(tile, side);
            if (neighbor && !neighbor.discovered) {
                frontierIds.add(neighbor.id);
            }
        }
    }

    return Array.from(frontierIds)
        .map((tileId) => tileIndex[tileId])
        .filter((tile): tile is Tile => !!tile)
        .sort((a, b) => a.id.localeCompare(b.id));
}

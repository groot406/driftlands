import { resolveWorldTile } from '../../core/worldGeneration.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { axialDistanceCoords } from './hex.ts';
import { isTileInSettlement } from './settlement';
import { ensureTileExists, tileIndex, tiles } from './world.ts';

const DEFAULT_WATER_HINT_RADIUS = 12;
const DEFAULT_FOREST_HINT_RADIUS = 8;

export function hasDiscoveredWaterTile(): boolean {
    return tiles.some((tile) => tile.discovered && tile.terrain === 'water');
}

function belongsToSettlement(tile: Tile, settlementId: string | null | undefined) {
    return !settlementId || isTileInSettlement(tile, settlementId);
}

export function hasDiscoveredWaterTileForSettlement(settlementId: string | null | undefined): boolean {
    return tiles.some((tile) => tile.discovered && tile.terrain === 'water' && belongsToSettlement(tile, settlementId));
}

export function hasDiscoveredForestTile(): boolean {
    return tiles.some((tile) => tile.discovered && tile.terrain === 'forest');
}

export function hasDiscoveredForestTileForSettlement(settlementId: string | null | undefined): boolean {
    return tiles.some((tile) => tile.discovered && tile.terrain === 'forest' && belongsToSettlement(tile, settlementId));
}

export function hasDiscoveredDirtTile(): boolean {
    return tiles.some((tile) => tile.discovered && tile.terrain === 'dirt');
}

function findNearestUndiscoveredTerrainTile(
    terrain: 'forest' | 'water' | 'dirt',
    origin: { q: number; r: number } = { q: 0, r: 0 },
    maxRadius: number,
): Tile | null {
    const searchRadius = Math.max(1, Math.floor(maxRadius));

    for (let radius = 1; radius <= searchRadius; radius++) {
        for (let dq = -radius; dq <= radius; dq++) {
            for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
                const q = origin.q + dq;
                const r = origin.r + dr;

                if (axialDistanceCoords(origin.q, origin.r, q, r) !== radius) {
                    continue;
                }

                const tile = tileIndex[`${q},${r}`] ?? null;
                if (tile?.discovered) {
                    continue;
                }

                if ((tile?.terrain ?? resolveWorldTile(q, r, origin).terrain) === terrain) {
                    return tile ?? ensureTileExists(q, r);
                }
            }
        }
    }

    return null;
}

export function findNearestUndiscoveredWaterTile(
    origin: { q: number; r: number } = { q: 0, r: 0 },
    maxRadius: number = DEFAULT_WATER_HINT_RADIUS,
): Tile | null {
    return findNearestUndiscoveredTerrainTile('water', origin, maxRadius);
}

export function findNearestUndiscoveredForestTile(
    origin: { q: number; r: number } = { q: 0, r: 0 },
    maxRadius: number = DEFAULT_FOREST_HINT_RADIUS,
): Tile | null {
    return findNearestUndiscoveredTerrainTile('forest', origin, maxRadius);
}

export function getWaterDiscoveryHintTile(
    origin: { q: number; r: number } = { q: 0, r: 0 },
    maxRadius: number = DEFAULT_WATER_HINT_RADIUS,
    settlementId?: string | null,
): Tile | null {
    if (settlementId ? hasDiscoveredWaterTileForSettlement(settlementId) : hasDiscoveredWaterTile()) {
        return null;
    }

    return findNearestUndiscoveredWaterTile(origin, maxRadius);
}

export function getForestDiscoveryHintTile(
    origin: { q: number; r: number } = { q: 0, r: 0 },
    maxRadius: number = DEFAULT_FOREST_HINT_RADIUS,
    settlementId?: string | null,
): Tile | null {
    if (settlementId ? hasDiscoveredForestTileForSettlement(settlementId) : hasDiscoveredForestTile()) {
        return null;
    }

    return findNearestUndiscoveredForestTile(origin, maxRadius);
}

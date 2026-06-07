import { getVariantSet } from '../../core/terrainRegistry';
import { SIDE_NAMES, type Tile } from '../../core/types/Tile';
import { axialDistanceCoords } from '../game/hex';
import { isTileWalkable } from '../game/navigation';
import { ensureTileExists, tileIndex } from '../game/world';
import { findNearestWalkableNeighborToTerrain } from '../game/worldQueries';
import { getBuildingDefinitionForTile, listBuildingDefinitions } from './registry';
import { isTileActive } from '../game/state/settlementSupportStore';
import { isBuildingOfflineFromCondition } from './maintenance.ts';
import { isTileControlledBySettlement } from '../game/state/settlementSupportStore';

const WELL_WATER_SOURCE_RADIUS = 3;

function getNeighbors(tile: Tile) {
    return tile.neighbors ?? ensureTileExists(tile.q, tile.r).neighbors;
}

function isNaturalWaterSourceTile(tile: Tile | null | undefined) {
    return !!tile && tile.discovered && tile.terrain === 'water';
}

export function isWaterSourceBuildingTile(tile: Tile | null | undefined) {
    return !!tile
        && isTileActive(tile)
        && !isBuildingOfflineFromCondition(tile)
        && !!getBuildingDefinitionForTile(tile)?.providesWaterSource;
}

function hasWaterSourceBuildingInRadius(tile: Tile, radius: number = WELL_WATER_SOURCE_RADIUS): boolean {
    for (const building of listBuildingDefinitions()) {
        if (!building.providesWaterSource) continue;

        for (const variantKey of building.variantKeys) {
            for (const tileId of getVariantSet(variantKey)) {
                const source = tileIndex[tileId];
                if (!isWaterSourceBuildingTile(source)) continue;
                if (axialDistanceCoords(tile.q, tile.r, source.q, source.r) <= radius) {
                    return true;
                }
            }
        }
    }

    return false;
}

export function hasAdjacentWaterSource(tile: Tile | null | undefined): boolean {
    if (!tile?.discovered) return false;

    const neighbors = getNeighbors(tile);
    if (!neighbors) return false;

    for (const side of SIDE_NAMES) {
        const neighbor = neighbors[side];
        if (!neighbor?.discovered) continue;
        if (isNaturalWaterSourceTile(neighbor) || isWaterSourceBuildingTile(neighbor)) {
            return true;
        }
    }

    return hasWaterSourceBuildingInRadius(tile);
}

export function canDrawWaterFromTile(tile: Tile | null | undefined): boolean {
    if (!tile?.discovered) return false;

    if (isWaterSourceBuildingTile(tile) && isTileWalkable(tile)) {
        return true;
    }

    const neighbors = getNeighbors(tile);
    if (!neighbors) return false;

    for (const side of SIDE_NAMES) {
        if (isNaturalWaterSourceTile(neighbors[side])) {
            return true;
        }
    }

    return hasWaterSourceBuildingInRadius(tile);
}

function findNearestWaterBuildingAccessTile(q: number, r: number, settlementId: string | null | undefined = null): Tile | null {
    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const building of listBuildingDefinitions()) {
        if (!building.providesWaterSource) continue;

        for (const variantKey of building.variantKeys) {
            for (const tileId of getVariantSet(variantKey)) {
                const tile = tileIndex[tileId];
                if (!tile?.discovered || !isTileWalkable(tile)) continue;
                if (settlementId && !isTileControlledBySettlement(tile, settlementId)) continue;

                const distance = axialDistanceCoords(q, r, tile.q, tile.r);
                if (distance < bestDistance) {
                    best = tile;
                    bestDistance = distance;
                }
            }
        }
    }

    return best;
}

export function findNearestWaterAccessTile(q: number, r: number, settlementId: string | null | undefined = null): Tile | null {
    const shoreline = findNearestWalkableNeighborToTerrain(q, r, 'water', settlementId);
    const buildingSource = findNearestWaterBuildingAccessTile(q, r, settlementId);

    if (!shoreline) return buildingSource;
    if (!buildingSource) return shoreline;

    const shorelineDistance = axialDistanceCoords(q, r, shoreline.q, shoreline.r);
    const buildingDistance = axialDistanceCoords(q, r, buildingSource.q, buildingSource.r);

    return buildingDistance < shorelineDistance ? buildingSource : shoreline;
}

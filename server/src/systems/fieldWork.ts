import { applyVariant } from '../../../src/core/variants';
import { terrainPositions, updateTileVariantIndex } from '../../../src/core/terrainRegistry';
import type { TerrainKey } from '../../../src/core/terrainDefs.ts';
import { hasAdjacentWaterSource } from '../../../src/shared/buildings/water';
import { isTileActive } from '../../../src/shared/game/state/settlementSupportStore';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { getTilesInRadius } from '../../../src/shared/game/world';
import type { ResolvedJobSite } from './jobSiteRuntime';

const FIELD_WORK_RADIUS = 1;

const FIELD_CROP_BY_BUILDING: Partial<Record<string, { terrain: TerrainKey; plantedVariant: string }>> = {
    granary: { terrain: 'grain', plantedVariant: 'grain_planted' },
    brewery: { terrain: 'hops', plantedVariant: 'hops_planted' },
    winery: { terrain: 'grapes', plantedVariant: 'grapes_planted' },
};

function setTileTerrain(tile: Tile, terrain: TerrainKey) {
    const previousTerrain = tile.terrain;
    if (previousTerrain === terrain) {
        return false;
    }

    if (previousTerrain) {
        terrainPositions[previousTerrain]?.delete(tile.id);
    }
    tile.terrain = terrain;
    terrainPositions[terrain]?.add(tile.id);
    return true;
}

function clearTileVariant(tile: Tile) {
    const previousVariant = tile.variant ?? null;
    if (!previousVariant && tile.variantSetMs === undefined && tile.variantAgeMs === undefined && tile.isBaseTile) {
        return false;
    }

    updateTileVariantIndex(tile.id, previousVariant, null);
    tile.variant = null;
    tile.variantSetMs = undefined;
    tile.variantAgeMs = undefined;
    tile.isBaseTile = true;
    return true;
}

function plantField(tile: Tile, terrain: TerrainKey, plantedVariant: string) {
    setTileTerrain(tile, terrain);
    applyVariant(tile, plantedVariant, { stagger: false, respectBiome: false });
    return true;
}

function prepareDirtField(tile: Tile) {
    applyVariant(tile, hasAdjacentWaterSource(tile) ? 'dirt_tilled_hydrated' : 'dirt_tilled_draught', {
        stagger: false,
        respectBiome: true,
    });
    return true;
}

function irrigateDirtField(tile: Tile) {
    if (tile.variant !== 'dirt_tilled_draught' || !hasAdjacentWaterSource(tile)) {
        return false;
    }

    applyVariant(tile, 'dirt_tilled', { stagger: false, respectBiome: true });
    return true;
}

function advanceDirtField(tile: Tile, terrain: TerrainKey, plantedVariant: string) {
    if (tile.terrain !== 'dirt') {
        return false;
    }

    let changed = false;
    if (tile.isBaseTile && !tile.variant) {
        changed = prepareDirtField(tile) || changed;
    }

    if (tile.variant === 'dirt_tilled_draught') {
        changed = irrigateDirtField(tile) || changed;
    }

    if (tile.variant === 'dirt_tilled' || tile.variant === 'dirt_tilled_hydrated') {
        changed = plantField(tile, terrain, plantedVariant) || changed;
    }

    return changed;
}

function advanceCropField(tile: Tile, terrain: TerrainKey, plantedVariant: string) {
    if (tile.terrain !== terrain || !tile.isBaseTile) {
        return false;
    }

    clearTileVariant(tile);
    setTileTerrain(tile, 'dirt');
    advanceDirtField(tile, terrain, plantedVariant);
    return true;
}

function listManagedFieldTiles(site: ResolvedJobSite, terrain: TerrainKey) {
    return getTilesInRadius(site.tile.q, site.tile.r, FIELD_WORK_RADIUS)
        .filter((tile) => tile.id !== site.tile.id)
        .filter((tile) => tile.discovered && isTileActive(tile))
        .filter((tile) => tile.terrain === terrain || tile.terrain === 'dirt')
        .sort((a, b) => a.id.localeCompare(b.id));
}

export function maintainJobSiteFields(site: ResolvedJobSite) {
    const crop = FIELD_CROP_BY_BUILDING[site.building.key];
    if (!crop) {
        return false;
    }

    let changed = false;
    for (const tile of listManagedFieldTiles(site, crop.terrain)) {
        changed = advanceCropField(tile, crop.terrain, crop.plantedVariant)
            || advanceDirtField(tile, crop.terrain, crop.plantedVariant)
            || changed;
    }

    return changed;
}

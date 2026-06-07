import { applyVariant } from '../../../src/core/variants';
import { terrainPositions, updateTileVariantIndex } from '../../../src/core/terrainRegistry';
import type { TerrainKey } from '../../../src/core/terrainDefs.ts';
import type { ResourceAmount, ResourceType } from '../../../src/core/types/Resource.ts';
import { hasAdjacentWaterSource } from '../../../src/shared/buildings/water';
import { isTileActive } from '../../../src/shared/game/state/settlementSupportStore';
import {
    countActiveAdjacentRevealedSpecial,
    hasRevealedModifier,
} from '../../../src/shared/game/tileFeatures.ts';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { getTilesInRadius, tileIndex } from '../../../src/shared/game/world';
import type { ResolvedJobSite } from './jobSiteRuntime';

export type AgriculturalFieldPhase = 'prepare_land' | 'irrigate' | 'seed' | 'harvest';

export interface AgriculturalFieldAction {
    phase: AgriculturalFieldPhase;
    fieldTileId: string;
    durationMs: number;
}

export interface AgriculturalFieldCompletion {
    changed: boolean;
    tile: Tile | null;
    harvested: ResourceAmount | null;
}

interface AgriculturalCropConfig {
    terrain: TerrainKey;
    plantedVariant: string;
    resourceType: ResourceType;
    baseYield: number;
}

export const AGRICULTURAL_FIELD_SUBTASK_MS = 10_000;
export const AGRICULTURAL_PROCESS_SUBTASK_MS = 20_000;

const FIELD_WORK_RADIUS = 1;

const FIELD_CROP_BY_BUILDING: Partial<Record<string, AgriculturalCropConfig>> = {
    granary: { terrain: 'grain', plantedVariant: 'grain_planted', resourceType: 'grain', baseYield: 3 },
    brewery: { terrain: 'hops', plantedVariant: 'hops_planted', resourceType: 'hops', baseYield: 2 },
    winery: { terrain: 'grapes', plantedVariant: 'grapes_planted', resourceType: 'grapes', baseYield: 2 },
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

function prepareDirtField(tile: Tile) {
    applyVariant(tile, hasAdjacentWaterSource(tile) ? 'dirt_tilled_hydrated' : 'dirt_tilled_draught', {
        stagger: false,
        respectBiome: true,
    });
    return true;
}

function irrigateDirtField(tile: Tile) {
    if (tile.variant !== 'dirt_tilled_draught') {
        return false;
    }

    applyVariant(tile, 'dirt_tilled', { stagger: false, respectBiome: true });
    return true;
}

function plantField(tile: Tile, terrain: TerrainKey, plantedVariant: string) {
    setTileTerrain(tile, terrain);
    applyVariant(tile, plantedVariant, { stagger: false, respectBiome: false });
    return true;
}

function getHarvestYield(tile: Tile, crop: AgriculturalCropConfig) {
    const modifierBonus = hasRevealedModifier(tile, 'rich_soil') ? 1 : 0;
    const basinBonus = countActiveAdjacentRevealedSpecial(tile, 'fertile_basin') > 0 ? 1 : 0;
    return crop.baseYield + modifierBonus + basinBonus;
}

function listManagedFieldTiles(site: ResolvedJobSite, terrain: TerrainKey, excludedTileIds: ReadonlySet<string>) {
    return getTilesInRadius(site.tile.q, site.tile.r, FIELD_WORK_RADIUS)
        .filter((tile) => tile.id !== site.tile.id)
        .filter((tile) => !excludedTileIds.has(tile.id))
        .filter((tile) => tile.discovered && isTileActive(tile))
        .filter((tile) => tile.terrain === terrain || tile.terrain === 'dirt')
        .sort((a, b) => a.id.localeCompare(b.id));
}

function countManagedFieldSlots(site: ResolvedJobSite, crop: AgriculturalCropConfig) {
    return 1 + listManagedFieldTiles(site, crop.terrain, new Set()).length;
}

function isBareDirt(tile: Tile) {
    return tile.terrain === 'dirt' && tile.isBaseTile && !tile.variant;
}

function isDryPreparedDirt(tile: Tile) {
    return tile.terrain === 'dirt' && tile.variant === 'dirt_tilled_draught';
}

function isSeedReadyDirt(tile: Tile) {
    return tile.terrain === 'dirt' && (tile.variant === 'dirt_tilled' || tile.variant === 'dirt_tilled_hydrated');
}

function isMatureCrop(tile: Tile, crop: AgriculturalCropConfig) {
    return tile.terrain === crop.terrain && tile.isBaseTile;
}

function makeFieldAction(phase: AgriculturalFieldPhase, tile: Tile): AgriculturalFieldAction {
    return {
        phase,
        fieldTileId: tile.id,
        durationMs: AGRICULTURAL_FIELD_SUBTASK_MS,
    };
}

export function getAgriculturalCropConfig(site: ResolvedJobSite) {
    return FIELD_CROP_BY_BUILDING[site.building.key] ?? null;
}

export function isAgriculturalJobSite(site: ResolvedJobSite) {
    return !!getAgriculturalCropConfig(site);
}

export function chooseAgriculturalFieldAction(
    site: ResolvedJobSite,
    excludedTileIds: ReadonlySet<string> = new Set(),
): AgriculturalFieldAction | null {
    const crop = getAgriculturalCropConfig(site);
    if (!crop) {
        return null;
    }

    const fields = listManagedFieldTiles(site, crop.terrain, excludedTileIds);
    const matureCrop = fields.find((tile) => isMatureCrop(tile, crop));
    if (matureCrop) {
        return makeFieldAction('harvest', matureCrop);
    }

    const bareDirt = fields.find(isBareDirt);
    if (bareDirt) {
        return makeFieldAction('prepare_land', bareDirt);
    }

    const dryPrepared = fields.find(isDryPreparedDirt);
    if (dryPrepared) {
        return makeFieldAction('irrigate', dryPrepared);
    }

    const seedReady = fields.find(isSeedReadyDirt);
    if (seedReady) {
        return makeFieldAction('seed', seedReady);
    }

    return null;
}

export function getAgriculturalFieldAction(site: ResolvedJobSite, phase: AgriculturalFieldPhase, fieldTileId: string) {
    const crop = getAgriculturalCropConfig(site);
    const tile = tileIndex[fieldTileId] ?? null;
    if (!crop || !tile || !tile.discovered || !isTileActive(tile)) {
        return null;
    }

    switch (phase) {
        case 'harvest':
            return isMatureCrop(tile, crop) ? makeFieldAction(phase, tile) : null;
        case 'prepare_land':
            return isBareDirt(tile) ? makeFieldAction(phase, tile) : null;
        case 'irrigate':
            return isDryPreparedDirt(tile) ? makeFieldAction(phase, tile) : null;
        case 'seed':
            return isSeedReadyDirt(tile) ? makeFieldAction(phase, tile) : null;
        default:
            return null;
    }
}

export function completeAgriculturalFieldAction(
    site: ResolvedJobSite,
    action: AgriculturalFieldAction,
): AgriculturalFieldCompletion {
    const crop = getAgriculturalCropConfig(site);
    const tile = tileIndex[action.fieldTileId] ?? null;
    if (!crop || !tile) {
        return { changed: false, tile: null, harvested: null };
    }

    switch (action.phase) {
        case 'prepare_land': {
            if (!isBareDirt(tile)) {
                return { changed: false, tile, harvested: null };
            }
            return { changed: prepareDirtField(tile), tile, harvested: null };
        }
        case 'irrigate': {
            return { changed: irrigateDirtField(tile), tile, harvested: null };
        }
        case 'seed': {
            if (!isSeedReadyDirt(tile)) {
                return { changed: false, tile, harvested: null };
            }
            return { changed: plantField(tile, crop.terrain, crop.plantedVariant), tile, harvested: null };
        }
        case 'harvest': {
            if (!isMatureCrop(tile, crop)) {
                return { changed: false, tile, harvested: null };
            }
            const harvested = { type: crop.resourceType, amount: getHarvestYield(tile, crop) };
            let changed = clearTileVariant(tile);
            changed = setTileTerrain(tile, 'dirt') || changed;
            return { changed, tile, harvested };
        }
        default:
            return { changed: false, tile, harvested: null };
    }
}

export function getAgriculturalProcessInputs(site: ResolvedJobSite): ResourceAmount[] {
    switch (site.building.key) {
        case 'brewery':
            return [{ type: 'grain', amount: 1 }, { type: 'hops', amount: 2 }];
        case 'winery':
            return [{ type: 'grapes', amount: 2 }];
        default:
            return [];
    }
}

export function getAgriculturalProcessOutput(site: ResolvedJobSite): ResourceAmount | null {
    const crop = getAgriculturalCropConfig(site);
    if (!crop) {
        return null;
    }

    const managedFields = countManagedFieldSlots(site, crop);
    switch (site.building.key) {
        case 'brewery':
            return { type: 'beer', amount: Math.min(6, 2 + managedFields) };
        case 'winery':
            return { type: 'wine', amount: Math.min(3, 1 + Math.floor(managedFields / 2)) };
        default:
            return null;
    }
}

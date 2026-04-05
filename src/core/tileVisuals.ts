import { getClimateProfile, getDecorativePatchNoise, getWorldGenerationSeed, noise01 } from './worldVariation';
import { TERRAIN_DEFS, type TerrainKey, type TerrainSide, type TerrainVariationDef } from './terrainDefs';
import type { Tile } from './types/Tile';

type NeighborResolver = (side: TerrainSide) => TerrainKey | null;

interface DecorativeSelection {
    variant: TerrainVariationDef | null;
    assetKey: string;
    overlayKey: string | null;
    overlayOffset: { x: number; y: number };
}

const SIDE_ORDER: TerrainSide[] = ['a', 'b', 'c', 'd', 'e', 'f'];
const decorativeSelectionCache = new Map<string, DecorativeSelection>();

function pickWeight(weight: number | undefined): number {
    return Math.max(0, weight ?? 1);
}

function matchesConstraints(
    q: number,
    r: number,
    variant: TerrainVariationDef,
    getNeighborTerrain: NeighborResolver,
): boolean {
    const climate = getClimateProfile(q, r);

    if (variant.minMoisture !== undefined && climate.moisture < variant.minMoisture) return false;
    if (variant.maxMoisture !== undefined && climate.moisture > variant.maxMoisture) return false;
    if (variant.minTemperature !== undefined && climate.temperature < variant.minTemperature) return false;
    if (variant.maxTemperature !== undefined && climate.temperature > variant.maxTemperature) return false;
    if (variant.minRuggedness !== undefined && climate.ruggedness < variant.minRuggedness) return false;
    if (variant.maxRuggedness !== undefined && climate.ruggedness > variant.maxRuggedness) return false;

    for (const constraint of variant.constraints ?? []) {
        const neighbor = getNeighborTerrain(constraint.side);
        if (!neighbor) {
            if (constraint.allowUndiscovered) continue;
            return false;
        }
        if (!constraint.anyOf.includes(neighbor)) return false;
    }

    return true;
}

function getCacheKey(q: number, r: number, terrain: TerrainKey, getNeighborTerrain: NeighborResolver): string {
    const neighborSignature = SIDE_ORDER.map(side => getNeighborTerrain(side) ?? '_').join('.');
    return `${getWorldGenerationSeed()}:${q},${r}:${terrain}:${neighborSignature}`;
}

function selectDecorativeVariant(
    q: number,
    r: number,
    terrain: TerrainKey,
    getNeighborTerrain: NeighborResolver,
): DecorativeSelection {
    const def = TERRAIN_DEFS[terrain];
    const baseAssetKey = def.assetKey ?? terrain;
    const baseOverlayKey = def.overlayAssetKey ?? null;
    const baseOverlayOffset = def.overlayOffset ?? { x: 0, y: 0 };
    const variants = def.decorativeVariants ?? [];

    if (!variants.length) {
        return {
            variant: null,
            assetKey: baseAssetKey,
            overlayKey: baseOverlayKey,
            overlayOffset: baseOverlayOffset,
        };
    }

    const eligible = variants.filter(variant => matchesConstraints(q, r, variant, getNeighborTerrain));
    if (!eligible.length) {
        return {
            variant: null,
            assetKey: baseAssetKey,
            overlayKey: baseOverlayKey,
            overlayOffset: baseOverlayOffset,
        };
    }
    const pool = eligible;
    const baseWeight = Math.max(0, def.decorativeBaseWeight ?? 18);
    const total = baseWeight + pool.reduce((sum, variant) => sum + pickWeight(variant.weight), 0);

    if (total <= 0) {
        return {
            variant: null,
            assetKey: baseAssetKey,
            overlayKey: baseOverlayKey,
            overlayOffset: baseOverlayOffset,
        };
    }

    const patchRoll = getDecorativePatchNoise(q, r, terrain.length + 17);
    const detailRoll = noise01(q, r, 733 + terrain.length);
    let roll = (((patchRoll * 0.74) + (detailRoll * 0.26)) * total);
    if (roll < baseWeight) {
        return {
            variant: null,
            assetKey: baseAssetKey,
            overlayKey: baseOverlayKey,
            overlayOffset: baseOverlayOffset,
        };
    }

    roll -= baseWeight;
    for (const variant of pool) {
        const weight = pickWeight(variant.weight);
        if (roll <= weight) {
            let overlayKey = baseOverlayKey;
            if (variant.overlayAssetKey) overlayKey = variant.overlayAssetKey;
            if (variant.overlayAssetKey === false) overlayKey = null;
            return {
                variant,
                assetKey: variant.assetKey ?? variant.key,
                overlayKey,
                overlayOffset: variant.overlayOffset ?? baseOverlayOffset,
            };
        }
        roll -= weight;
    }

    return {
        variant: null,
        assetKey: baseAssetKey,
        overlayKey: baseOverlayKey,
        overlayOffset: baseOverlayOffset,
    };
}

export function getDecorativeSelectionForTerrain(
    q: number,
    r: number,
    terrain: TerrainKey,
    getNeighborTerrain: NeighborResolver,
): DecorativeSelection {
    const cacheKey = getCacheKey(q, r, terrain, getNeighborTerrain);
    const cached = decorativeSelectionCache.get(cacheKey);
    if (cached) return cached;

    const selection = selectDecorativeVariant(q, r, terrain, getNeighborTerrain);
    decorativeSelectionCache.set(cacheKey, selection);
    return selection;
}

export function getDecorativeSelectionForTile(tile: Tile): DecorativeSelection | null {
    if (!tile.terrain) return null;
    return getDecorativeSelectionForTerrain(tile.q, tile.r, tile.terrain, side => {
        const neighbor = tile.neighbors?.[side];
        if (!neighbor?.discovered || !neighbor.terrain) return null;
        return neighbor.terrain;
    });
}

import type {Tile} from './types/Tile';
import {tileIndex} from './world';
import {TERRAIN_DEFS} from './terrainDefs';
import {BIOME_DEFS} from './biomes';
import { updateTileVariantIndex } from './terrainRegistry';
import { broadcastGameMessage as broadcast } from '../shared/game/runtime';

// Track tiles with aging variants
const agingTiles = new Set<string>();

type GrowthConfig = { ageMs?: number; ageMsRange?: number[] };

function getGrowthMultiplier(tile: Tile): number {
    const biome = tile.biome as keyof typeof BIOME_DEFS | null;
    if (!biome) return 1;

    const mult = BIOME_DEFS[biome]?.variantGrowthScale?.[tile.variant ?? ''];
    return mult && mult > 0 ? mult : 1;
}

function getBaseGrowthAgeMs(growth: GrowthConfig, randomize: boolean): number {
    if (typeof growth.ageMs === 'number') {
        return growth.ageMs;
    }

    const [minAge, maxAge] = growth.ageMsRange ?? [];
    if (typeof minAge !== 'number' || typeof maxAge !== 'number') {
        return 0;
    }

    if (!randomize) {
        return Math.round((minAge + maxAge) / 2);
    }

    const low = Math.min(minAge, maxAge);
    const high = Math.max(minAge, maxAge);
    return Math.floor(Math.random() * (high - low + 1)) + low;
}

export function registerAgingTile(tile: Tile) {
    if (!tile.variant) return;
    const def = tile.terrain ? TERRAIN_DEFS[tile.terrain] : null;
    const variantDef = def?.variations?.find(v => v.key === tile.variant);
    if (variantDef?.growth) agingTiles.add(tile.id);
}

// Re-register tiles loaded from persistence
export function registerExistingAgingTiles(tiles: Tile[]) {
    for (const t of tiles) {
        if (!t.discovered || !t.terrain || !t.variant) continue;
        const def = TERRAIN_DEFS[t.terrain];
        const variantDef = def?.variations?.find(v => v.key === t.variant);
        if (variantDef?.growth) agingTiles.add(t.id);
    }
}

export function resetTileGrowthTracking() {
    agingTiles.clear();
}

export function getEffectiveAgeMs(
    tile: Tile,
    growth: GrowthConfig,
    options: { baseAgeMs?: number; respectBiome?: boolean } = {},
): number {
    const baseAge = options.baseAgeMs ?? getBaseGrowthAgeMs(growth, false);
    if (options.respectBiome === false) {
        return baseAge;
    }

    return Math.round(baseAge * getGrowthMultiplier(tile));
}

export function resolveTileGrowthDurationMs(
    tile: Tile,
    growth: GrowthConfig,
    options: { respectBiome?: boolean } = {},
): number {
    if (typeof tile.variantAgeMs === 'number' && tile.variantAgeMs > 0) {
        return tile.variantAgeMs;
    }

    const baseAge = getBaseGrowthAgeMs(growth, true);
    const effectiveAge = getEffectiveAgeMs(tile, growth, {
        baseAgeMs: baseAge,
        respectBiome: options.respectBiome,
    });

    tile.variantAgeMs = effectiveAge > 0 ? effectiveAge : undefined;
    return effectiveAge;
}

export function updateTileGrowth(nowMs: number = Date.now()) {
    if (agingTiles.size === 0) return;

    const toRemove: string[] = [];
    for (const id of agingTiles) {
        const t = tileIndex[id];
        if (!t || !t.discovered || !t.terrain || !t.variant) {
            toRemove.push(id);
            continue;
        }
        const def = TERRAIN_DEFS[t.terrain];
        const variantDef = def?.variations?.find(v => v.key === t.variant);
        if (!variantDef?.growth) {
            toRemove.push(id);
            continue;
        }
        const started = t.variantSetMs ?? 0;
        if (!started) {
            toRemove.push(id);
            continue;
        }
        const {next} = variantDef.growth;
        const effectiveAge = resolveTileGrowthDurationMs(t, variantDef.growth);
        if (nowMs - started >= effectiveAge) {
            // Transition
            const prevVariant = t.variant;
            t.variant = next; // next null means return to base terrain representation
            updateTileVariantIndex(t.id, prevVariant, next);
            if (next) {
                // If chain continues, keep tracking
                const nextDef = def?.variations?.find(v => v.key === next);
                t.variantSetMs = nowMs;
                t.variantAgeMs = undefined;
                if (!nextDef?.growth) {
                    t.variantSetMs = undefined;
                    t.variantAgeMs = undefined;
                    toRemove.push(id);
                } else {
                    resolveTileGrowthDurationMs(t, nextDef.growth);
                }
            } else {
                t.variantSetMs = undefined;
                t.variantAgeMs = undefined;
                toRemove.push(id);
            }
            broadcast({type: 'tile:updated', tile: t} );
        }
    }
    for (const id of toRemove) agingTiles.delete(id);
}

import type {Tile} from './world';
import {tileIndex, tiles, worldVersion} from './world';
import {TERRAIN_DEFS} from './terrainDefs';
import {BIOME_DEFS} from './biomes';
import {applyVariant} from './variants';

// Track tiles with aging variants
const agingTiles = new Set<string>();

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

export function getEffectiveAgeMs(tile: Tile, growth: { ageMs?: number; ageMsRange?: number[] }): number {
    const baseAge = growth.ageMs ?? (growth.ageMsRange && growth.ageMsRange.length >= 2
        ? Math.round((growth.ageMsRange[0]! + growth.ageMsRange[1]!) / 2)
        : 0);
    const biome = tile.biome as keyof typeof BIOME_DEFS | null;
    if (!biome) return baseAge;
    const mult = BIOME_DEFS[biome]?.variantGrowthScale?.[tile.variant ?? ''];
    if (!mult || mult === 1) return baseAge;
    return baseAge * mult;
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
        const effectiveAge = getEffectiveAgeMs(t, variantDef.growth);
        if (nowMs - started >= effectiveAge) {
            // Transition
            t.variant = next; // next null means return to base terrain representation
            t.variantSetMs = next ? nowMs : undefined;
            if (next) {
                // If chain continues, keep tracking
                const nextDef = def?.variations?.find(v => v.key === next);
                if (!nextDef?.growth) {
                    toRemove.push(id);
                }
            } else {
                toRemove.push(id);
            }
            worldVersion.value++;
        }
    }
    for (const id of toRemove) agingTiles.delete(id);
}

// Fast-forward growth progression for offline time.
// lastMs: timestamp of last in-game update; nowMs: current timestamp when resuming.
export function fastForwardGrowthOffline(lastMs: number, nowMs: number) {
    const elapsed = Math.max(0, nowMs - lastMs);
    if (elapsed <= 0) return;
    let anyChanged = false;
    // Iterate over all tiles since agingTiles may be empty if app was closed before registration.
    for (const t of tiles) {
        if (!t.discovered || !t.terrain) continue;
        let currentVariant = t.variant;
        if (!currentVariant) continue;

        const def = TERRAIN_DEFS[t.terrain];
        const getVarDef = (key: string | null) => def?.variations?.find(v => v.key === key);
        let vDef = getVarDef(currentVariant);
        if (!vDef?.growth) continue;

        const startMs = t.variantSetMs ?? lastMs; // if missing, assume started at lastMs
        // Progress already accumulated up to lastMs
        let remainingMs = elapsed;
        let stageProgressMs = Math.max(0, lastMs - startMs);
        // Consume elapsed across chained stages
        while (remainingMs > 0 && vDef?.growth) {
            const stageAgeMs = getEffectiveAgeMs(t, vDef.growth);
            const stageRemaining = Math.max(0, stageAgeMs - stageProgressMs);
            if (remainingMs >= stageRemaining) {
                // Complete current stage
                remainingMs -= stageRemaining;
                const next = vDef.growth.next ?? null;
                applyVariant(t, next, {setTimestamp: false}); // don't override timestamp yet
                anyChanged = true;
                currentVariant = next;
                vDef = getVarDef(currentVariant);
                // Reset progress for next stage starting exactly at the completion moment
                stageProgressMs = 0;
                if (currentVariant) {
                    // Stage started at the completion time => lastMs + (elapsed consumed so far)
                    t.variantSetMs = lastMs + (elapsed - remainingMs);
                    agingTiles.add(t.id);
                } else {
                    // Chain ended; stop tracking
                    t.variantSetMs = undefined;
                    agingTiles.delete(t.id);
                    break;
                }
            } else {
                // Partial progress into current stage
                stageProgressMs += remainingMs;
                remainingMs = 0;
                const progressedAt = lastMs + (elapsed);
                t.variantSetMs = progressedAt - stageProgressMs; // ensure nowMs - variantSetMs equals cumulative progress
                agingTiles.add(t.id);
                anyChanged = true;
                break;
            }
        }
    }
    if (anyChanged) worldVersion.value++;
}

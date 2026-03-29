import {registerAgingTile, resolveTileGrowthDurationMs} from './growth';
import {TERRAIN_DEFS} from './terrainDefs';
import {updateTileVariantIndex} from './terrainRegistry';
import type {Tile} from "./types/Tile.ts";
import type {TileUpdatedMessage} from "../shared/protocol.ts";
import { broadcastGameMessage as broadcast } from '../shared/game/runtime';

interface ApplyVariantOptions {
    stagger?: boolean; // apply random backward offset across effective age window
    respectBiome?: boolean; // scale aging time using biomeScale
    setTimestamp?: boolean; // set variantSetMs (if growth config present)
}

export function applyVariant(tile: Tile, variantKey: string | null, opts: ApplyVariantOptions = {}) {
    const prev = tile.variant;
    tile.variant = variantKey;
    updateTileVariantIndex(tile.id, prev, variantKey);

    if (!variantKey) {
        tile.variantSetMs = undefined;
        tile.variantAgeMs = undefined;
        broadcast({type: 'tile:updated', tile} as TileUpdatedMessage)
        return;
    }

    const def = tile.terrain ? TERRAIN_DEFS[tile.terrain] : null;
    const variantDef = def?.variations?.find(v => v.key === variantKey);
    if (!variantDef?.growth) {
        tile.variantSetMs = undefined;
        tile.variantAgeMs = undefined;
        broadcast({type: 'tile:updated', tile} as TileUpdatedMessage)
        return;
    }

    if (opts.setTimestamp !== false) {
        // Resolve a single duration for this stage so ranged growth stays consistent across ticks.
        tile.variantAgeMs = undefined;
        const effectiveAge = resolveTileGrowthDurationMs(tile, variantDef.growth, {
            respectBiome: opts.respectBiome,
        });
        if (opts.stagger) {
            const offset = Math.floor(Math.random() * effectiveAge);
            tile.variantSetMs = Date.now() - offset;
        } else {
            tile.variantSetMs = Date.now();
        }
    }
    registerAgingTile(tile);
    broadcast({type: 'tile:updated', tile} as TileUpdatedMessage)
}

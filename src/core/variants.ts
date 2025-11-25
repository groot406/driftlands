import type { Tile } from './world';
import { registerAgingTile, getEffectiveAgeMs } from './growth';
import { TERRAIN_DEFS } from './terrainDefs';
import { updateTileVariantIndex } from './terrainRegistry';

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
    return;
  }

  const def = tile.terrain ? TERRAIN_DEFS[tile.terrain] : null;
  const variantDef = def?.variations?.find(v => v.key === variantKey);
  if (!variantDef?.growth) {
    tile.variantSetMs = undefined;
    return;
  }
  if (opts.setTimestamp !== false) {
    // Compute effective age (only needed for stagger offset). Timestamp always set to now unless stagger indicates backdating.
    let effectiveAge = variantDef.growth.ageMs ?? 0;
    if(variantDef.growth.ageMsRange) {
        const [minAge, maxAge] = variantDef.growth.ageMsRange;
        effectiveAge = Math.floor(Math.random() * (maxAge - minAge + 1)) + minAge;
    }

    if (opts.respectBiome) {
      effectiveAge = getEffectiveAgeMs(tile, variantDef.growth);
    }
    if (opts.stagger) {
      const offset = Math.floor(Math.random() * effectiveAge);
      tile.variantSetMs = Date.now() - offset;
    } else {
      tile.variantSetMs = Date.now();
    }
  }
  registerAgingTile(tile);
}

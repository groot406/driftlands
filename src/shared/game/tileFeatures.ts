import { worldNoise01 } from '../../core/worldVariation.ts';
import type { TerrainKey } from '../../core/terrainDefs.ts';
import { SIDE_NAMES, type Tile, type TileModifierKey, type TileSpecialKey } from '../../core/types/Tile.ts';

const MODIFIER_ROLL_SALT = 9121;
const SPECIAL_ROLL_SALT = 9149;
export const VOLCANIC_PRODUCTION_OUTPUT_MULTIPLIER = 1.25;
export const VOLCANIC_GROWTH_DURATION_MULTIPLIER = 0.75;

export function resolveGeneratedTileModifier(q: number, r: number, terrain: TerrainKey): TileModifierKey | null {
  const value = worldNoise01(q, r, MODIFIER_ROLL_SALT);

  switch (terrain) {
    case 'plains':
    case 'grain':
      return value > 0.91 ? 'rich_soil' : null;
    case 'dirt':
      if (value > 0.94) return 'rich_soil';
      if (value < 0.08) return 'rocky_ground';
      return null;
    case 'mountain':
      return value > 0.9 ? 'rocky_ground' : null;
    case 'forest':
      return value > 0.88 ? 'dense_forest' : null;
    case 'dessert':
      return value > 0.86 ? 'sand_rich' : null;
    default:
      return null;
  }
}

export function resolveGeneratedTileSpecial(q: number, r: number, terrain: TerrainKey): TileSpecialKey | null {
  const value = worldNoise01(q, r, SPECIAL_ROLL_SALT);

  switch (terrain) {
    case 'plains':
    case 'grain':
      return value > 0.975 ? 'fertile_basin' : null;
    case 'water':
      return value > 0.97 ? 'natural_crossing' : null;
    case 'mountain':
      return value > 0.965 ? 'rich_ore_vein' : null;
    case 'dirt':
    case 'dessert':
    case 'snow':
      return value > 0.985 ? 'ancient_ruins' : null;
    default:
      return null;
  }
}

export function revealTileFeatures(tile: Tile | null | undefined) {
  if (!tile) {
    return false;
  }

  const hadHiddenModifier = !!tile.modifier && !tile.modifierRevealed;
  const hadHiddenSpecial = !!tile.special && !tile.specialRevealed;
  const wasUnsurveyed = tile.surveyed !== true;
  tile.surveyed = true;
  if (tile.modifier) {
    tile.modifierRevealed = true;
  }
  if (tile.special) {
    tile.specialRevealed = true;
  }
  return wasUnsurveyed || hadHiddenModifier || hadHiddenSpecial;
}

export function hasRevealedModifier(tile: Tile | null | undefined, modifier: TileModifierKey) {
  return tile?.modifier === modifier && tile.modifierRevealed === true;
}

export function hasRevealedSpecial(tile: Tile | null | undefined, special: TileSpecialKey) {
  return tile?.special === special && tile.specialRevealed === true;
}

export function hasActivatedSpecial(tile: Tile | null | undefined, special: TileSpecialKey) {
  return hasRevealedSpecial(tile, special) && tile?.specialActivated === true;
}

function listAdjacentTiles(tile: Tile | null | undefined) {
  if (!tile) {
    return [];
  }

  const neighbors = tile.neighbors;
  if (!neighbors) {
    return [];
  }

  return SIDE_NAMES
    .map((side) => neighbors[side])
    .filter((neighbor): neighbor is Tile => !!neighbor);
}

function isFeatureTileActive(tile: Tile) {
  return tile.discovered && tile.activationState !== 'inactive';
}

export function countActiveAdjacentRevealedModifier(tile: Tile | null | undefined, modifier: TileModifierKey) {
  return listAdjacentTiles(tile).filter((neighbor) => isFeatureTileActive(neighbor) && hasRevealedModifier(neighbor, modifier)).length;
}

export function countActiveAdjacentRevealedSpecial(tile: Tile | null | undefined, special: TileSpecialKey) {
  return listAdjacentTiles(tile).filter((neighbor) => isFeatureTileActive(neighbor) && hasRevealedSpecial(neighbor, special)).length;
}

export function countActiveAdjacentTerrain(tile: Tile | null | undefined, terrain: TerrainKey) {
  return listAdjacentTiles(tile).filter((neighbor) => isFeatureTileActive(neighbor) && neighbor.terrain === terrain).length;
}

export function hasActiveAdjacentVolcano(tile: Tile | null | undefined) {
  return countActiveAdjacentTerrain(tile, 'vulcano') > 0;
}

export function getVolcanicProductionMultiplier(tile: Tile | null | undefined) {
  return hasActiveAdjacentVolcano(tile) ? VOLCANIC_PRODUCTION_OUTPUT_MULTIPLIER : 1;
}

export function getVolcanicGrowthDurationMultiplier(tile: Tile | null | undefined) {
  return hasActiveAdjacentVolcano(tile) ? VOLCANIC_GROWTH_DURATION_MULTIPLIER : 1;
}

export function getTileProductionBoostMultiplier(tile: Tile | null | undefined) {
  const multiplier = tile?.nextProductionBoostMultiplier;
  const cycles = tile?.nextProductionBoostCyclesRemaining;
  const hasCycles = cycles === undefined || cycles === null || cycles > 0;
  return hasCycles && typeof multiplier === 'number' && multiplier > 1 ? multiplier : 1;
}

export function getTileProductionBoostInputReduction(tile: Tile | null | undefined) {
  const cycles = tile?.nextProductionBoostCyclesRemaining;
  const hasCycles = cycles === undefined || cycles === null || cycles > 0;
  const reduction = tile?.nextProductionBoostInputReduction;
  return hasCycles && typeof reduction === 'number' && reduction > 0 ? Math.floor(reduction) : 0;
}

export function consumeTileProductionBoost(tile: Tile | null | undefined) {
  if (!tile?.nextProductionBoostMultiplier) {
    return false;
  }

  const remainingCycles = Math.max(1, Math.floor(tile.nextProductionBoostCyclesRemaining ?? 1)) - 1;
  if (remainingCycles > 0) {
    tile.nextProductionBoostCyclesRemaining = remainingCycles;
    return true;
  }

  tile.nextProductionBoostMultiplier = null;
  tile.nextProductionBoostCyclesRemaining = null;
  tile.nextProductionBoostInputReduction = null;
  return true;
}

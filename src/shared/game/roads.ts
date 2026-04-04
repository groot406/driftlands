import { TERRAIN_DEFS } from '../../core/terrainDefs.ts';
import type { Tile, TileSide } from '../../core/types/Tile.ts';

const PROCEDURAL_ROAD_VARIANTS = new Set([
  'road',
  'road_ad',
  'road_be',
  'road_ce',
  'road_cf',
]);

export function isProceduralRoadVariant(variant: string | null | undefined) {
  return PROCEDURAL_ROAD_VARIANTS.has(variant ?? '');
}

export function isRoadTile(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return tile?.terrain === 'plains' && isProceduralRoadVariant(tile.variant);
}

/**
 * Checks if a tile is a valid target for a road to connect to.
 * @param tile The potential target tile
 * @param fromSide The side of the target tile that the road is coming FROM (e.g. if we are at tile T and look at neighbor at side 'a', fromSide is 'd')
 */
export function isRoadConnectionTarget(tile: Tile | null | undefined, fromSide?: TileSide) {
  if (!tile || !tile.terrain) return false;

  if (isRoadTile(tile)) {
    return true;
  }


  const def = TERRAIN_DEFS[tile.terrain];
  if (!def) return false;

  // Check variant override first
  if (tile.variant) {
    const variantDef = def.variations?.find(v => v.key === tile.variant) ||
        def.decorativeVariants?.find(v => v.key === tile.variant);

    // Check if the side we are connecting to is fenced
    if (fromSide && variantDef && variantDef.fencedEdges?.[fromSide]) {
      return false;
    }

    if (variantDef && variantDef.connectsToRoad !== undefined) {
      return variantDef.connectsToRoad;
    }
  }

  // Check if the side we are connecting to is fenced
  if (fromSide && def.fencedEdges?.[fromSide]) {
    return false;
  }

  return !!def.connectsToRoad;
}

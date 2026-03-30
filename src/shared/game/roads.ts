import type { Tile } from '../../core/types/Tile.ts';

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

export function isRoadConnectionTarget(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return tile?.terrain === 'towncenter' ||
      isRoadTile(tile) ||
      (tile?.terrain === 'water' && tile?.variant?.startsWith('water_dock_'));
}

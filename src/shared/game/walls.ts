import { OPPOSITE_SIDE, SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile.ts';
import { isWatchtowerTile } from './military.ts';

const PROCEDURAL_WALL_VARIANTS = new Set([
  'plains_wall',
  'plains_wall_ad',
  'plains_wall_be',
  'plains_wall_ce',
  'plains_wall_cf',
  'dirt_wall',
  'dirt_wall_ad',
  'dirt_wall_be',
  'dirt_wall_ce',
  'dirt_wall_cf',
  'plains_stone_wall',
  'plains_stone_wall_ad',
  'plains_stone_wall_be',
  'plains_stone_wall_ce',
  'plains_stone_wall_cf',
  'dirt_stone_wall',
  'dirt_stone_wall_ad',
  'dirt_stone_wall_be',
  'dirt_stone_wall_ce',
  'dirt_stone_wall_cf',
]);

export function isProceduralWallVariant(variant: string | null | undefined) {
  return PROCEDURAL_WALL_VARIANTS.has(variant ?? '');
}

export function isWallTile(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return (tile?.terrain === 'plains' || tile?.terrain === 'dirt') && isProceduralWallVariant(tile.variant);
}

export function isStoneWallTile(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return (tile?.terrain === 'plains' || tile?.terrain === 'dirt')
    && (
      (tile.variant?.startsWith('plains_stone_wall') ?? false)
      || (tile.variant?.startsWith('dirt_stone_wall') ?? false)
    );
}

function isWallAnchorTile(tile: Tile | null | undefined) {
  return !!tile && (tile.terrain === 'towncenter' || isWatchtowerTile(tile) || isWallTile(tile));
}

export function isWallConnectionTarget(tile: Tile | null | undefined, _fromSide?: TileSide) {
  return isWallAnchorTile(tile);
}

export function hasAdjacentWallBuildAnchor(tile: Tile | null | undefined) {
  if (!tile?.neighbors) {
    return false;
  }

  return SIDE_NAMES.some((side) => isWallConnectionTarget(tile.neighbors?.[side], OPPOSITE_SIDE[side]));
}

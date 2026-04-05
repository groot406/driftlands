import { OPPOSITE_SIDE, SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile.ts';
import { isTileWalkable } from './navigation.ts';
import { ensureTileExists } from './world.ts';

export const PROCEDURAL_BRIDGE_VARIANTS = new Set([
  'water_bridge_ad',
  'water_bridge_be',
  'water_bridge_cf',
]);

export type BridgeVariantKey = 'water_bridge_ad' | 'water_bridge_be' | 'water_bridge_cf';

const BRIDGE_CONNECTIONS: Record<BridgeVariantKey, readonly [TileSide, TileSide]> = {
  water_bridge_ad: ['a', 'd'],
  water_bridge_be: ['b', 'e'],
  water_bridge_cf: ['c', 'f'],
};

const BRIDGE_VARIANT_BY_APPROACH_SIDE: Record<TileSide, BridgeVariantKey> = {
  a: 'water_bridge_ad',
  b: 'water_bridge_be',
  c: 'water_bridge_cf',
  d: 'water_bridge_ad',
  e: 'water_bridge_be',
  f: 'water_bridge_cf',
};

const SIDE_DELTAS: Record<TileSide, readonly [number, number]> = {
  a: [0, -1],
  b: [1, -1],
  c: [1, 0],
  d: [0, 1],
  e: [-1, 1],
  f: [-1, 0],
};

function getNeighborTile(tile: Tile, side: TileSide) {
  const [dq, dr] = SIDE_DELTAS[side];
  return tile.neighbors?.[side] ?? ensureTileExists(tile.q + dq, tile.r + dr);
}

export function isProceduralBridgeVariant(variant: string | null | undefined): variant is BridgeVariantKey {
  return PROCEDURAL_BRIDGE_VARIANTS.has(variant ?? '');
}

export function isBridgeTile(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return tile?.terrain === 'water' && isProceduralBridgeVariant(tile.variant);
}

export function getBridgeConnectionSides(tileOrVariant: Pick<Tile, 'variant'> | BridgeVariantKey | null | undefined) {
  const variant = typeof tileOrVariant === 'string' ? tileOrVariant : tileOrVariant?.variant;
  if (!isProceduralBridgeVariant(variant)) {
    return null;
  }

  return BRIDGE_CONNECTIONS[variant];
}

export function bridgeVariantSupportsSide(
  tileOrVariant: Pick<Tile, 'variant'> | BridgeVariantKey | null | undefined,
  side: TileSide,
) {
  const connections = getBridgeConnectionSides(tileOrVariant);
  return !!connections && (connections[0] === side || connections[1] === side);
}

export function getBridgeVariantForApproachSide(side: TileSide): BridgeVariantKey {
  return BRIDGE_VARIANT_BY_APPROACH_SIDE[side];
}

export function getNeighborSide(tile: Tile | null | undefined, neighbor: Pick<Tile, 'id'> | null | undefined): TileSide | null {
  if (!tile || !neighbor) {
    return null;
  }

  for (const side of SIDE_NAMES) {
    if (getNeighborTile(tile, side)?.id === neighbor.id) {
      return side;
    }
  }

  return null;
}

function isBridgeAccessTileCompatible(targetTile: Tile, accessTile: Tile) {
  const side = getNeighborSide(targetTile, accessTile);
  if (!side || !accessTile.discovered || !isTileWalkable(accessTile)) {
    return false;
  }

  if (accessTile.terrain !== 'water') {
    return true;
  }

  return isBridgeTile(accessTile) && bridgeVariantSupportsSide(accessTile, OPPOSITE_SIDE[side]);
}

export function listBridgeAccessTiles(tile: Tile | null | undefined) {
  if (!tile || tile.terrain !== 'water') {
    return [];
  }

  const result: Tile[] = [];

  for (const side of SIDE_NAMES) {
    const accessTile = getNeighborTile(tile, side);
    if (!accessTile || !isBridgeAccessTileCompatible(tile, accessTile)) {
      continue;
    }

    result.push(accessTile);
  }

  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

export function resolveBridgeVariantFromAccessTile(
  targetTile: Tile | null | undefined,
  accessTile: Tile | null | undefined,
): BridgeVariantKey | null {
  if (!targetTile || !accessTile || targetTile.terrain !== 'water') {
    return null;
  }

  const side = getNeighborSide(targetTile, accessTile);
  if (!side || !isBridgeAccessTileCompatible(targetTile, accessTile)) {
    return null;
  }

  return getBridgeVariantForApproachSide(side);
}

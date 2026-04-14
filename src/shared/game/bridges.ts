import { OPPOSITE_SIDE, SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile.ts';
import { isTileWalkable } from './navigation.ts';
import { isInfrastructureBuildAnchorTile } from './roads.ts';
import { ensureTileExists } from './world.ts';

export const PROCEDURAL_BRIDGE_VARIANTS = new Set([
  'water_bridge_ad',
  'water_bridge_be',
  'water_bridge_cf',
]);

export const PROCEDURAL_TUNNEL_VARIANTS = new Set([
  'mountain_tunnel_ad',
  'mountain_tunnel_be',
  'mountain_tunnel_cf',
]);

export type BridgeVariantKey = 'water_bridge_ad' | 'water_bridge_be' | 'water_bridge_cf';
export type TunnelVariantKey = 'mountain_tunnel_ad' | 'mountain_tunnel_be' | 'mountain_tunnel_cf';

const BRIDGE_CONNECTIONS: Record<BridgeVariantKey, readonly [TileSide, TileSide]> = {
  water_bridge_ad: ['a', 'd'],
  water_bridge_be: ['b', 'e'],
  water_bridge_cf: ['c', 'f'],
};

const TUNNEL_CONNECTIONS: Record<TunnelVariantKey, readonly [TileSide, TileSide]> = {
  mountain_tunnel_ad: ['a', 'd'],
  mountain_tunnel_be: ['b', 'e'],
  mountain_tunnel_cf: ['c', 'f'],
};

const BRIDGE_VARIANT_BY_APPROACH_SIDE: Record<TileSide, BridgeVariantKey> = {
  a: 'water_bridge_ad',
  b: 'water_bridge_be',
  c: 'water_bridge_cf',
  d: 'water_bridge_ad',
  e: 'water_bridge_be',
  f: 'water_bridge_cf',
};

const TUNNEL_VARIANT_BY_APPROACH_SIDE: Record<TileSide, TunnelVariantKey> = {
  a: 'mountain_tunnel_ad',
  b: 'mountain_tunnel_be',
  c: 'mountain_tunnel_cf',
  d: 'mountain_tunnel_ad',
  e: 'mountain_tunnel_be',
  f: 'mountain_tunnel_cf',
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

export function isProceduralTunnelVariant(variant: string | null | undefined): variant is TunnelVariantKey {
  return PROCEDURAL_TUNNEL_VARIANTS.has(variant ?? '');
}

export function isBridgeTile(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return tile?.terrain === 'water' && isProceduralBridgeVariant(tile.variant);
}

export function isTunnelTile(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return tile?.terrain === 'mountain' && isProceduralTunnelVariant(tile.variant);
}

export function getBridgeConnectionSides(tileOrVariant: Pick<Tile, 'variant'> | string | null | undefined) {
  const variant = typeof tileOrVariant === 'string' ? tileOrVariant : tileOrVariant?.variant;
  if (!isProceduralBridgeVariant(variant)) {
    return null;
  }

  return BRIDGE_CONNECTIONS[variant];
}

export function getTunnelConnectionSides(tileOrVariant: Pick<Tile, 'variant'> | string | null | undefined) {
  const variant = typeof tileOrVariant === 'string' ? tileOrVariant : tileOrVariant?.variant;
  if (!isProceduralTunnelVariant(variant)) {
    return null;
  }

  return TUNNEL_CONNECTIONS[variant];
}

export function bridgeVariantSupportsSide(
  tileOrVariant: Pick<Tile, 'variant'> | string | null | undefined,
  side: TileSide,
) {
  const connections = getBridgeConnectionSides(tileOrVariant);
  return !!connections && (connections[0] === side || connections[1] === side);
}

export function tunnelVariantSupportsSide(
  tileOrVariant: Pick<Tile, 'variant'> | string | null | undefined,
  side: TileSide,
) {
  const connections = getTunnelConnectionSides(tileOrVariant);
  return !!connections && (connections[0] === side || connections[1] === side);
}

export function getBridgeVariantForApproachSide(side: TileSide): BridgeVariantKey {
  return BRIDGE_VARIANT_BY_APPROACH_SIDE[side];
}

export function getTunnelVariantForApproachSide(side: TileSide): TunnelVariantKey {
  return TUNNEL_VARIANT_BY_APPROACH_SIDE[side];
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

function isLinearCrossingAccessTileCompatible(
  targetTile: Tile,
  accessTile: Tile,
  terrain: Tile['terrain'],
  isCrossingTile: (tile: Tile | null | undefined) => boolean,
  crossingSupportsSide: (
    tileOrVariant: Pick<Tile, 'variant'> | string | null | undefined,
    side: TileSide,
  ) => boolean,
) {
  const side = getNeighborSide(targetTile, accessTile);
  if (!side || !accessTile.discovered || !isTileWalkable(accessTile)) {
    return false;
  }

  if (accessTile.terrain !== terrain) {
    return true;
  }

  return isCrossingTile(accessTile) && crossingSupportsSide(accessTile, OPPOSITE_SIDE[side]);
}

export function isBridgeConstructionAccessTile(targetTile: Tile | null | undefined, accessTile: Tile | null | undefined) {
  if (!targetTile || !accessTile || targetTile.terrain !== 'water') {
    return false;
  }

  const side = getNeighborSide(targetTile, accessTile);
  if (
    !side
    || !isLinearCrossingAccessTileCompatible(targetTile, accessTile, 'water', isBridgeTile, bridgeVariantSupportsSide)
  ) {
    return false;
  }

  if (accessTile.terrain === 'water') {
    return isBridgeTile(accessTile) && bridgeVariantSupportsSide(accessTile, OPPOSITE_SIDE[side]);
  }

  return isInfrastructureBuildAnchorTile(accessTile, OPPOSITE_SIDE[side]);
}

export function isTunnelConstructionAccessTile(targetTile: Tile | null | undefined, accessTile: Tile | null | undefined) {
  if (!targetTile || !accessTile || targetTile.terrain !== 'mountain') {
    return false;
  }

  const side = getNeighborSide(targetTile, accessTile);
  if (
    !side
    || !isLinearCrossingAccessTileCompatible(targetTile, accessTile, 'mountain', isTunnelTile, tunnelVariantSupportsSide)
  ) {
    return false;
  }

  if (accessTile.terrain === 'mountain') {
    return isTunnelTile(accessTile) && tunnelVariantSupportsSide(accessTile, OPPOSITE_SIDE[side]);
  }

  return isInfrastructureBuildAnchorTile(accessTile, OPPOSITE_SIDE[side]);
}

export function listBridgeAccessTiles(tile: Tile | null | undefined) {
  if (!tile || tile.terrain !== 'water') {
    return [];
  }

  const result: Tile[] = [];

  for (const side of SIDE_NAMES) {
    const accessTile = getNeighborTile(tile, side);
    if (!accessTile || !isBridgeConstructionAccessTile(tile, accessTile)) {
      continue;
    }

    result.push(accessTile);
  }

  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

export function listTunnelAccessTiles(tile: Tile | null | undefined) {
  if (!tile || tile.terrain !== 'mountain') {
    return [];
  }

  const result: Tile[] = [];

  for (const side of SIDE_NAMES) {
    const accessTile = getNeighborTile(tile, side);
    if (!accessTile || !isTunnelConstructionAccessTile(tile, accessTile)) {
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
  if (!side || !isBridgeConstructionAccessTile(targetTile, accessTile)) {
    return null;
  }

  return getBridgeVariantForApproachSide(side);
}

export function resolveTunnelVariantFromAccessTile(
  targetTile: Tile | null | undefined,
  accessTile: Tile | null | undefined,
): TunnelVariantKey | null {
  if (!targetTile || !accessTile || targetTile.terrain !== 'mountain') {
    return null;
  }

  const side = getNeighborSide(targetTile, accessTile);
  if (!side || !isTunnelConstructionAccessTile(targetTile, accessTile)) {
    return null;
  }

  return getTunnelVariantForApproachSide(side);
}

import { TERRAIN_DEFS } from '../../core/terrainDefs.ts';
import { OPPOSITE_SIDE, SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile.ts';
import { getBuildingDefinitionForTile } from '../buildings/registry.ts';

const PROCEDURAL_ROAD_VARIANTS = new Set([
  'road',
  'road_ad',
  'road_be',
  'road_ce',
  'road_cf',
  'stone_road',
  'stone_road_ad',
  'stone_road_be',
  'stone_road_ce',
  'stone_road_cf',
]);

export function isProceduralRoadVariant(variant: string | null | undefined) {
  return PROCEDURAL_ROAD_VARIANTS.has(variant ?? '');
}

export function isRoadTile(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return tile?.terrain === 'plains' && isProceduralRoadVariant(tile.variant);
}

function isBridgeBuildAnchorTile(tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined) {
  return (
    (tile?.terrain === 'water' && typeof tile.variant === 'string' && tile.variant.startsWith('water_bridge_'))
    || (tile?.terrain === 'mountain' && typeof tile.variant === 'string' && tile.variant.startsWith('mountain_tunnel_'))
  );
}

export function isInfrastructureBuildAnchorTile(tile: Tile | null | undefined, fromSide?: TileSide) {
  if (!tile) {
    return false;
  }

  return (tile.terrain === 'towncenter' || isRoadTile(tile) || isBridgeBuildAnchorTile(tile))
    && isRoadConnectionTarget(tile, fromSide);
}

export function isRoadBuildAnchorTile(tile: Tile | null | undefined, fromSide?: TileSide) {
  return isInfrastructureBuildAnchorTile(tile, fromSide);
}

export function hasAdjacentRoadBuildAnchor(tile: Tile | null | undefined) {
  if (!tile?.neighbors) {
    return false;
  }

  return SIDE_NAMES.some((side) => isInfrastructureBuildAnchorTile(tile.neighbors?.[side], OPPOSITE_SIDE[side]));
}

function getVariantDefinition(tile: Tile) {
  const def = TERRAIN_DEFS[tile.terrain!];
  if (!def || !tile.variant) {
    return null;
  }

  return (
    def.variations?.find((variation) => variation.key === tile.variant) ??
    def.decorativeVariants?.find((variation) => variation.key === tile.variant) ??
    null
  );
}

function isRoadConnectionAllowedByTerrain(tile: Tile | null | undefined, fromSide?: TileSide) {
  if (!tile || !tile.terrain) return false;

  if (isRoadTile(tile)) {
    return true;
  }

  const def = TERRAIN_DEFS[tile.terrain];
  if (!def) return false;

  const variantDef = getVariantDefinition(tile);
  const fencedEdges = tile.fencedEdges ?? variantDef?.fencedEdges ?? def.fencedEdges;

  if (fromSide && fencedEdges?.[fromSide]) {
    return false;
  }

  if (variantDef && variantDef.connectsToRoad !== undefined) {
    return variantDef.connectsToRoad;
  }

  return !!def.connectsToRoad;
}

function getMaxIncomingRoads(tile: Tile | null | undefined) {
  return tile ? getBuildingDefinitionForTile(tile)?.maxIncomingRoads : undefined;
}

function getIncomingRoadSides(tile: Tile | null | undefined) {
  if (!tile?.neighbors) {
    return [];
  }

  return SIDE_NAMES.filter(
    (side) => isRoadTile(tile.neighbors?.[side]) && isRoadConnectionAllowedByTerrain(tile, side),
  );
}

/**
 * Checks if a tile is a valid target for a road to connect to.
 * @param tile The potential target tile
 * @param fromSide The side of the target tile that the road is coming FROM (e.g. if we are at tile T and look at neighbor at side 'a', fromSide is 'd')
 */
export function isRoadConnectionTarget(tile: Tile | null | undefined, fromSide?: TileSide) {
  if (!isRoadConnectionAllowedByTerrain(tile, fromSide)) {
    return false;
  }

  if (!fromSide) {
    return true;
  }

  const maxIncomingRoads = getMaxIncomingRoads(tile);
  if (maxIncomingRoads === undefined) {
    return true;
  }

  const incomingRoadSides = getIncomingRoadSides(tile);
  const currentRoadIndex = incomingRoadSides.indexOf(fromSide);
  if (currentRoadIndex >= 0) {
    return currentRoadIndex < maxIncomingRoads;
  }

  return incomingRoadSides.length < maxIncomingRoads;
}

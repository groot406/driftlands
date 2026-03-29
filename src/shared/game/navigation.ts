import { OPPOSITE_SIDE, type Tile, type TileSide } from '../../core/types/Tile';
import { TERRAIN_DEFS } from './terrainDefs';
import { getTile } from './world';

export interface PathTimingResult {
  durations: number[];
  cumulative: number[];
  totalDuration: number;
  avg: number;
}

function getVariantDef(tile: Tile | null | undefined) {
  if (!tile?.terrain || !tile.variant) return null;
  return TERRAIN_DEFS[tile.terrain]?.variations?.find(variant => variant.key === tile.variant) ?? null;
}

export function isTileWalkable(tile: Tile | null | undefined): boolean {
  if (!tile?.terrain) return false;

  const variantDef = getVariantDef(tile);
  if (variantDef && typeof variantDef.walkable === 'boolean') {
    return variantDef.walkable;
  }

  return !!TERRAIN_DEFS[tile.terrain]?.walkable;
}

export function isWalkablePosition(q: number, r: number): boolean {
  return isTileWalkable(getTile({ q, r }));
}

export function getTileMoveCost(tile: Tile | null | undefined): number {
  if (!tile?.terrain) return 1;
  const variantDef = getVariantDef(tile);
  if (typeof variantDef?.moveCost === 'number') {
    return Math.max(0.1, variantDef.moveCost);
  }
  return Math.max(0.1, TERRAIN_DEFS[tile.terrain]?.moveCost ?? 1);
}

export function getTileTravelTimeCost(tile: Tile | null | undefined): number {
  if (!tile?.terrain) return 1;

  if (tile.terrain === 'towncenter') {
    return 1.25;
  }

  const rawCost = getTileMoveCost(tile);
  if (rawCost <= 1) {
    return rawCost;
  }

  // Compress extreme terrain costs for animation timing so heroes don't look
  // frozen before visibly leaving a tile, while pathfinding can still prefer
  // easier terrain using the full movement cost.
  return Math.min(2.1, 1 + (Math.sqrt(rawCost - 1) * 0.45));
}

export function getEffectiveFencedEdges(tile: Tile | null | undefined) {
  if (!tile?.terrain) return {};
  const variantDef = getVariantDef(tile);
  return variantDef?.fencedEdges ?? TERRAIN_DEFS[tile.terrain]?.fencedEdges ?? {};
}

export function isEdgeBlocked(fromTile: Tile | null | undefined, toTile: Tile | null | undefined, side: TileSide): boolean {
  const fromEdges = getEffectiveFencedEdges(fromTile);
  const toEdges = getEffectiveFencedEdges(toTile);
  return !!(fromEdges[side] || toEdges[OPPOSITE_SIDE[side]]);
}

export function computePathTimings(
  path: { q: number; r: number }[],
  origin: { q: number; r: number },
  speedAdj = 1,
  baseStepMs = 750,
): PathTimingResult {
  const durations: number[] = [];

  for (let i = 0; i < path.length; i++) {
    const fromCoord = i === 0 ? origin : path[i - 1]!;
    const toCoord = path[i]!;
    const fromTile = getTile(fromCoord);
    const toTile = getTile(toCoord);
    const edgeCost = 0.5 * getTileTravelTimeCost(fromTile) + 0.5 * getTileTravelTimeCost(toTile);
    durations.push(Math.min(Math.max(120, baseStepMs * edgeCost * speedAdj), 5000));
  }

  const cumulative: number[] = [];
  let totalDuration = 0;
  for (const duration of durations) {
    totalDuration += duration;
    cumulative.push(totalDuration);
  }

  return {
    durations,
    cumulative,
    totalDuration,
    avg: durations.length ? totalDuration / durations.length : baseStepMs,
  };
}

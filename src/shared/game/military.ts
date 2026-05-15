import type { SettlementBorderMode, Tile, WatchtowerConflictState } from '../../core/types/Tile.ts';
import { axialDistanceCoords } from './hex';

export const DEFAULT_BORDER_MODE: SettlementBorderMode = 'closed';
export const BORDER_MODE_COOLDOWN_MS = 10 * 60_000;
export const BORDER_LOCKOUT_MS = 10 * 60_000;
export const TOWN_CENTER_SAFE_RADIUS = 4;
export const WATCHTOWER_MAX_DURABILITY = 100;
export const WATCHTOWER_PALISADE_WALL_LEVEL = 1;
export const GUARD_TRAINING_DURATION_MS = 90_000;
export const GUARD_TRAINING_FOOD_COST = 2;
export const GUARD_TRAINING_WEAPON_COST = 1;
export const WATCHTOWER_PALISADE_WOOD_COST = 8;

const WATCHTOWER_VARIANT_KEYS = new Set([
  'plains_watchtower',
  'dirt_watchtower',
  'mountains_watchtower',
  'snow_watchtower',
  'dessert_watchtower',
]);

const BARRACKS_VARIANT_KEYS = new Set([
  'plains_barracks',
  'dirt_barracks',
]);

export function isTownCenterTile(tile: Tile | null | undefined) {
  return tile?.terrain === 'towncenter';
}

export function isWatchtowerTile(tile: Tile | null | undefined) {
  return !!tile?.variant && WATCHTOWER_VARIANT_KEYS.has(tile.variant);
}

export function isBarracksTile(tile: Tile | null | undefined) {
  return !!tile?.variant && BARRACKS_VARIANT_KEYS.has(tile.variant);
}

export function ensureTownCenterMilitaryState(tile: Tile | null | undefined) {
  if (!isTownCenterTile(tile) || !tile) {
    return tile;
  }

  tile.borderMode ??= DEFAULT_BORDER_MODE;
  tile.borderModeCooldownUntilMs ??= null;
  tile.borderLockedUntilMs ??= null;
  tile.guardReserve ??= 0;
  tile.raidTargetTileId ??= null;
  tile.raidCommittedGuards ??= 0;
  tile.raidBlockedReason ??= null;
  return tile;
}

export function ensureWatchtowerMilitaryState(tile: Tile | null | undefined) {
  if (!isWatchtowerTile(tile) || !tile) {
    return tile;
  }

  tile.towerDurabilityMax ??= WATCHTOWER_MAX_DURABILITY;
  tile.towerDurability ??= tile.towerDurabilityMax;
  tile.towerCaptureProgress ??= 0;
  tile.towerConflictState ??= 'active';
  tile.towerAttackerSettlementId ??= null;
  tile.towerAssignedGuards ??= 0;
  tile.towerWallLevel ??= 0;
  tile.towerAttackerCasualtyProgress ??= 0;
  tile.towerDefenderCasualtyProgress ??= 0;
  return tile;
}

export function ensureBarracksMilitaryState(tile: Tile | null | undefined) {
  if (!isBarracksTile(tile) || !tile) {
    return tile;
  }

  tile.barracksTrainingQueue ??= 0;
  tile.barracksTrainingProgressMs ??= 0;
  return tile;
}

export function getSettlementBorderMode(tile: Tile | null | undefined): SettlementBorderMode {
  if (!isTownCenterTile(tile) || !tile) {
    return DEFAULT_BORDER_MODE;
  }

  return tile.borderMode ?? DEFAULT_BORDER_MODE;
}

export function isSettlementOpen(tile: Tile | null | undefined) {
  return getSettlementBorderMode(tile) === 'open';
}

export function getAvailableGuardReserve(tile: Tile | null | undefined) {
  return Math.max(0, tile?.guardReserve ?? 0);
}

export function getWatchtowerDurabilityPercent(tile: Tile | null | undefined) {
  const max = Math.max(1, tile?.towerDurabilityMax ?? WATCHTOWER_MAX_DURABILITY);
  return Math.max(0, Math.min(100, Math.round(((tile?.towerDurability ?? max) / max) * 100)));
}

export function getWatchtowerDefenseScore(tile: Tile | null | undefined) {
  const guardScore = (tile?.towerAssignedGuards ?? 0) * 1.5;
  const wallScore = (tile?.towerWallLevel ?? 0) * 2;
  const durabilityScore = getWatchtowerDurabilityPercent(tile) >= 50 ? 1 : 0.5;
  return 1 + guardScore + wallScore + durabilityScore;
}

export function isProtectedByTownCenter(targetTile: Tile | null | undefined, townCenterTile: Tile | null | undefined) {
  if (!targetTile || !townCenterTile) {
    return false;
  }

  return axialDistanceCoords(targetTile.q, targetTile.r, townCenterTile.q, townCenterTile.r) <= TOWN_CENTER_SAFE_RADIUS;
}

export function resolveWatchtowerConflictState(tile: Tile | null | undefined): WatchtowerConflictState {
  const captureProgress = Math.max(0, Math.round(tile?.towerCaptureProgress ?? 0));
  const durability = getWatchtowerDurabilityPercent(tile);

  if (captureProgress >= 100) {
    return 'captured';
  }

  if (captureProgress > 0) {
    return captureProgress >= 35 ? 'contested' : 'under_attack';
  }

  if (tile?.towerAttackerSettlementId) {
    return 'under_attack';
  }

  if (durability <= 20) {
    return 'disabled';
  }

  if (durability < 100) {
    return 'damaged';
  }

  return 'active';
}

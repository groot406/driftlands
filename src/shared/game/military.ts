import type { SettlementBorderMode, Tile, WatchtowerConflictState } from '../../core/types/Tile.ts';
import { axialDistanceCoords } from './hex';
import { getSettlementTownCenterTile, getTileSettlementId } from './settlement.ts';
import type { SeasonSnapshot } from '../seasons/types.ts';

export const DEFAULT_BORDER_MODE: SettlementBorderMode = 'closed';
export const BORDER_MODE_COOLDOWN_MS = 10 * 60_000;
export const BORDER_LOCKOUT_MS = 10 * 60_000;
export const TOWN_CENTER_SAFE_RADIUS = 4;
export const TOWN_CENTER_RAID_BLOCKING_WATCHTOWER_RADIUS = 15;
export const WATCHTOWER_MAX_DURABILITY = 100;
export const TOWN_CENTER_MAX_DURABILITY = 300;
export const WATCHTOWER_PALISADE_WALL_LEVEL = 1;
export const WATCHTOWER_ARROW_RANGE = 5;
export const RAIDER_COMBAT_HEALTH_MAX = 100;
export const WATCHTOWER_ARROW_DAMAGE_PER_GUARD_PER_SECOND = 12;
export const WATCHTOWER_PALISADE_ARROW_DAMAGE_BONUS_PER_SECOND = 2;
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
  'water_beacon',
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

export function isRaidableMilitaryTarget(tile: Tile | null | undefined) {
  return isWatchtowerTile(tile) || isTownCenterTile(tile);
}

export function shouldOpenTownCenterRaidDetail(
  tile: Pick<Tile, 'terrain' | 'id' | 'ownerSettlementId' | 'controlledBySettlementId'> | null | undefined,
  currentSettlementId: string | null | undefined,
) {
  if (!currentSettlementId || tile?.terrain !== 'towncenter') {
    return false;
  }

  return getTileSettlementId(tile) !== currentSettlementId;
}

export function shouldUseStandaloneMilitaryDetailMode(
  tile: Pick<Tile, 'terrain' | 'variant'> | null | undefined,
) {
  return tile?.terrain !== 'towncenter';
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
  tile.guardReserveOriginTileIds ??= [];
  tile.raidTargetTileId ??= null;
  tile.raidCommittedGuards ??= 0;
  tile.raidGuardOriginTileIds ??= [];
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
  tile.towerGuardOriginTileIds ??= [];
  tile.towerWallLevel ??= 0;
  tile.towerAttackerCasualtyProgress ??= 0;
  tile.towerDefenderCasualtyProgress ??= 0;
  return tile;
}

export function ensureRaidTargetMilitaryState(tile: Tile | null | undefined) {
  if (!tile) {
    return tile;
  }

  if (isWatchtowerTile(tile)) {
    return ensureWatchtowerMilitaryState(tile);
  }

  if (isTownCenterTile(tile)) {
    ensureTownCenterMilitaryState(tile);
    tile.towerDurabilityMax ??= TOWN_CENTER_MAX_DURABILITY;
    tile.towerDurability ??= tile.towerDurabilityMax;
    tile.towerCaptureProgress ??= 0;
    tile.towerConflictState ??= 'active';
    tile.towerAttackerSettlementId ??= null;
    tile.towerAssignedGuards ??= 0;
    tile.towerGuardOriginTileIds ??= [];
    tile.towerWallLevel ??= 0;
    tile.towerAttackerCasualtyProgress ??= 0;
    tile.towerDefenderCasualtyProgress ??= 0;
  }

  return tile;
}

export function ensureBarracksMilitaryState(tile: Tile | null | undefined) {
  if (!isBarracksTile(tile) || !tile) {
    return tile;
  }

  tile.guardReserve ??= 0;
  tile.guardReserveOriginTileIds ??= [];
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

export function getEffectiveSettlementBorderMode(
  tile: Tile | null | undefined,
  season: SeasonSnapshot | null | undefined,
): SettlementBorderMode {
  if (season?.status === 'active') {
    const stage = season.config.stages.find((candidate) => candidate.key === season.currentStage);
    if (stage?.borderPolicy === 'locked_closed') {
      return 'closed';
    }
    if (stage?.borderPolicy === 'locked_open') {
      return 'open';
    }
  }

  return getSettlementBorderMode(tile);
}

export function isSettlementEffectivelyOpen(
  tile: Tile | null | undefined,
  season: SeasonSnapshot | null | undefined,
) {
  return getEffectiveSettlementBorderMode(tile, season) === 'open';
}

export function isSettlementOpen(tile: Tile | null | undefined) {
  return getSettlementBorderMode(tile) === 'open';
}

type SettlementTileLookup = Iterable<Tile> | Record<string, Tile | undefined>;

function getTownCenterFromLookup(tiles: SettlementTileLookup, settlementId: string | null | undefined) {
  if (!settlementId) {
    return null;
  }

  if (Symbol.iterator in Object(tiles)) {
    return getSettlementTownCenterTile(tiles as Iterable<Tile>, settlementId);
  }

  const tileIndex = tiles as Record<string, Tile | undefined>;
  const direct = tileIndex[settlementId];
  if (direct?.terrain === 'towncenter' && getTileSettlementId(direct) === settlementId) {
    return direct;
  }

  return getSettlementTownCenterTile(
    Object.values(tileIndex).filter((tile): tile is Tile => !!tile),
    settlementId,
  );
}

export function canSettlementUseOpenBorderTransit(
  tile: Tile | null | undefined,
  settlementId: string | null | undefined,
  tiles: SettlementTileLookup,
) {
  if (!tile || !settlementId) {
    return false;
  }

  const tileSettlementId = getTileSettlementId(tile);
  if (!tileSettlementId || tileSettlementId === settlementId) {
    return false;
  }

  return isSettlementOpen(getTownCenterFromLookup(tiles, tileSettlementId));
}

export function getAvailableGuardReserve(tile: Tile | null | undefined) {
  return Math.max(0, tile?.guardReserve ?? 0);
}

export function getSettlementBarracksTiles<T extends Tile>(
  tiles: Iterable<T>,
  settlementId: string | null | undefined,
) {
  if (!settlementId) {
    return [];
  }

  return Array.from(tiles)
    .filter((tile) => isBarracksTile(tile) && getTileSettlementId(tile) === settlementId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getSettlementGuardReserve(
  tiles: Iterable<Tile>,
  settlementId: string | null | undefined,
) {
  return getSettlementBarracksTiles(tiles, settlementId)
    .reduce((sum, barracks) => sum + getAvailableGuardReserve(barracks), 0);
}

export function withdrawSettlementGuardReserve(
  tiles: Iterable<Tile>,
  settlementId: string | null | undefined,
  amount: number,
) {
  const requested = Math.max(0, Math.trunc(amount));
  if (requested <= 0) {
    return [];
  }

  const origins: string[] = [];
  let remaining = requested;
  for (const barracks of getSettlementBarracksTiles(tiles, settlementId)) {
    if (remaining <= 0) {
      break;
    }

    const reserve = getAvailableGuardReserve(barracks);
    const taken = Math.min(reserve, remaining);
    if (taken <= 0) {
      continue;
    }

    barracks.guardReserve = reserve - taken;
    origins.push(...Array.from({ length: taken }, () => barracks.id));
    remaining -= taken;
  }

  return origins;
}

export function returnSettlementGuardReserve(
  tiles: Iterable<Tile>,
  originTileIds: string[],
  fallbackSettlementId: string | null | undefined,
) {
  const tileList = Array.from(tiles);
  const tileById = new Map(tileList.map((tile) => [tile.id, tile]));
  const fallbackBarracks = getSettlementBarracksTiles(tileList, fallbackSettlementId)[0] ?? null;
  const changedTiles = new Map<string, Tile>();

  for (const originTileId of originTileIds) {
    const originTile = tileById.get(originTileId) ?? null;
    const originMatchesSettlement = !fallbackSettlementId || getTileSettlementId(originTile) === fallbackSettlementId;
    const barracks = isBarracksTile(originTile) && originMatchesSettlement ? originTile : fallbackBarracks;
    if (!barracks) {
      continue;
    }

    ensureBarracksMilitaryState(barracks);
    barracks.guardReserve = getAvailableGuardReserve(barracks) + 1;
    changedTiles.set(barracks.id, barracks);
  }

  return Array.from(changedTiles.values()).sort((a, b) => a.id.localeCompare(b.id));
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

export function hasUncapturedDefenderWatchtowerInTownCenterRaidRadius(
  tiles: Iterable<Tile>,
  townCenterTile: Tile | null | undefined,
  defenderSettlementId: string | null | undefined,
) {
  if (!townCenterTile || !defenderSettlementId) {
    return false;
  }

  return Array.from(tiles).some((tile) => (
    isWatchtowerTile(tile)
    && getTileSettlementId(tile) === defenderSettlementId
    && tile.towerConflictState !== 'captured'
    && axialDistanceCoords(tile.q, tile.r, townCenterTile.q, townCenterTile.r) <= TOWN_CENTER_RAID_BLOCKING_WATCHTOWER_RADIUS
  ));
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

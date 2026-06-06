import type { TickContext } from '../tick';
import { tileIndex } from '../../../src/shared/game/world.ts';
import {
  BORDER_LOCKOUT_MS,
  GUARD_TRAINING_DURATION_MS,
  GUARD_TRAINING_FOOD_COST,
  GUARD_TRAINING_WEAPON_COST,
  TOWN_CENTER_MAX_DURABILITY,
  WATCHTOWER_MAX_DURABILITY,
  ensureBarracksMilitaryState,
  ensureRaidTargetMilitaryState,
  ensureTownCenterMilitaryState,
  getAvailableGuardReserve,
  getEffectiveSettlementBorderMode,
  getSettlementBarracksTiles,
  getSettlementGuardReserve,
  isBarracksTile,
  isRaidableMilitaryTarget,
  isTownCenterTile,
  returnSettlementGuardReserve,
  resolveWatchtowerConflictState,
  withdrawSettlementGuardReserve,
} from '../../../src/shared/game/military.ts';
import type { Tile } from '../../../src/core/types/Tile.ts';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';
import type { ResourceWithdrawMessage, TileUpdatedMessage } from '../../../src/shared/protocol.ts';
import type { ResourceType } from '../../../src/core/types/Resource.ts';
import { broadcastPopulationState, getPopulationBySettlementInput, getPopulationSnapshot, getSettlementHungerInput, recalculatePopulationLimits, setSupportMetrics } from '../../../src/store/populationStore.ts';
import { recalculateSettlementSupport } from '../../../src/store/settlementSupportStore.ts';
import { getSettlementResourceInventory, withdrawResourceAcrossStoragesForSettlement } from '../../../src/store/resourceStore.ts';
import { getGuardTrainingSpeedMultiplier, testModeSettings } from '../../../src/shared/game/testMode.ts';
import { settlers } from '../../../src/shared/game/state/settlerStore.ts';
import { axialDistanceCoords } from '../../../src/shared/game/hex';
import { FOOD_SOURCE_TYPES, getResourceRequirementStock } from '../../../src/shared/game/resourceDefinitions.ts';
import { seasonState } from '../state/seasonState';
import { emitGameplayEvent } from '../../../src/shared/gameplay/events.ts';
import { getTileSettlementId } from '../../../src/shared/game/settlement.ts';

const TOWN_CENTER_RAID_CAPTURE_RATE_MULTIPLIER = 0.25;

function getTownCenters() {
  return Object.values(tileIndex).filter((tile) => isTownCenterTile(tile)).map((tile) => ensureTownCenterMilitaryState(tile)!);
}

function getBarracks() {
  return Object.values(tileIndex).filter((tile) => isBarracksTile(tile)).map((tile) => ensureBarracksMilitaryState(tile)!);
}

function getTownCenterTile(settlementId: string | null | undefined) {
  if (!settlementId) {
    return null;
  }

  const tile = tileIndex[settlementId] ?? null;
  return isTownCenterTile(tile) && getTileSettlementId(tile) === settlementId ? ensureTownCenterMilitaryState(tile) : null;
}

function roundedMilitaryValue(tile: Tile) {
  const fallbackDurability = isTownCenterTile(tile) ? TOWN_CENTER_MAX_DURABILITY : WATCHTOWER_MAX_DURABILITY;
  return `${Math.round(tile.towerDurability ?? fallbackDurability)}:${Math.round(tile.towerCaptureProgress ?? 0)}:${tile.towerConflictState ?? 'active'}:${tile.ownerSettlementId ?? ''}:${tile.controlledBySettlementId ?? ''}:${tile.towerAttackerSettlementId ?? ''}:${tile.towerAssignedGuards ?? 0}:${tile.guardReserve ?? 0}`;
}

function broadcastTile(tile: Tile) {
  broadcast({
    type: 'tile:updated',
    tile,
    timestamp: Date.now(),
  } satisfies TileUpdatedMessage);
}

function broadcastTileIds(tileIds: string[]) {
  for (const tileId of Array.from(new Set(tileIds))) {
    const tile = tileIndex[tileId];
    if (tile) {
      broadcastTile(tile);
    }
  }
}

function broadcastWithdrawals(
  resourceType: ResourceWithdrawMessage['resource']['type'],
  withdrawals: ReturnType<typeof withdrawResourceAcrossStoragesForSettlement>,
) {
  for (const withdrawal of withdrawals) {
    broadcast({
      type: 'resource:withdraw',
      heroId: 'guard-training',
      storageTileId: withdrawal.storageTileId,
      resource: {
        type: resourceType,
        amount: withdrawal.amount,
      },
    } satisfies ResourceWithdrawMessage);
  }
}

function withdrawFoodSourcesForSettlement(settlementId: string, amount: number) {
  const withdrawals: Array<{ resourceType: ResourceType; transfers: ReturnType<typeof withdrawResourceAcrossStoragesForSettlement> }> = [];
  let remaining = amount;

  for (const resourceType of FOOD_SOURCE_TYPES) {
    if (remaining <= 0) {
      break;
    }

    const transfers = withdrawResourceAcrossStoragesForSettlement(settlementId, resourceType, remaining);
    const withdrawn = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    if (withdrawn > 0) {
      withdrawals.push({ resourceType, transfers });
      remaining -= withdrawn;
    }
  }

  return withdrawals;
}

function syncTerritory() {
  const previousPopulation = getPopulationSnapshot();
  const result = recalculateSettlementSupport(getPopulationBySettlementInput(), getSettlementHungerInput());
  setSupportMetrics(result.snapshot);
  recalculatePopulationLimits();

  for (const tileId of result.changedTileIds) {
    const tile = tileIndex[tileId];
    if (tile) {
      broadcastTile(tile);
    }
  }

  const nextPopulation = getPopulationSnapshot();
  if (JSON.stringify(previousPopulation) !== JSON.stringify(nextPopulation)) {
    broadcastPopulationState();
  }
}

function getRaidSettlers(settlementId: string, targetTileId: string) {
  return settlers
    .filter((settler) => settler.assignedRole === 'guard' && settler.settlementId === settlementId && settler.guardTowerTileId === targetTileId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getDefenderSettlers(tower: Tile) {
  return settlers
    .filter((settler) => settler.assignedRole === 'guard' && settler.settlementId === tower.ownerSettlementId && settler.guardTowerTileId === tower.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function isSettlerAtTower(settler: typeof settlers[number], tower: Tile) {
  return axialDistanceCoords(settler.q, settler.r, tower.q, tower.r) <= 1 && !settler.movement;
}

function getRaidDefenseScore(tile: Tile, defenderGuardCount: number) {
  const guardScore = Math.max(0, defenderGuardCount) * 1.5;
  const wallScore = (tile.towerWallLevel ?? 0) * 2;
  const fallbackDurability = isTownCenterTile(tile) ? TOWN_CENTER_MAX_DURABILITY : WATCHTOWER_MAX_DURABILITY;
  const maxDurability = Math.max(1, tile.towerDurabilityMax ?? fallbackDurability);
  const durability = Math.max(0, Math.min(100, Math.round(((tile.towerDurability ?? maxDurability) / maxDurability) * 100)));
  const durabilityScore = durability >= 50 ? 1 : 0.5;
  return 1 + guardScore + wallScore + durabilityScore;
}

function getSettlementReserveTiles() {
  return Object.values(tileIndex);
}

function removeSettlersById(ids: string[]) {
  if (ids.length <= 0) {
    return false;
  }

  let changed = false;
  for (let index = settlers.length - 1; index >= 0; index--) {
    if (ids.includes(settlers[index]!.id)) {
      settlers.splice(index, 1);
      changed = true;
    }
  }
  return changed;
}

function applyWatchtowerCaptureTransfer(tower: Tile, attackerSettlementId: string) {
  const changedTileIds: string[] = [];
  for (const tile of Object.values(tileIndex)) {
    if (!tile.discovered || !tile.terrain || tile.terrain === 'towncenter') {
      continue;
    }
    if (axialDistanceCoords(tile.q, tile.r, tower.q, tower.r) > 6) {
      continue;
    }
    if (tile.ownerSettlementId === attackerSettlementId && tile.controlledBySettlementId === attackerSettlementId) {
      continue;
    }
    tile.ownerSettlementId = attackerSettlementId;
    tile.controlledBySettlementId = attackerSettlementId;
    changedTileIds.push(tile.id);
  }
  return changedTileIds;
}

function clearSettlementBarracksReserve(settlementId: string | null | undefined) {
  const changedTileIds: string[] = [];
  for (const barracks of getSettlementBarracksTiles(getSettlementReserveTiles(), settlementId)) {
    if (getAvailableGuardReserve(barracks) <= 0) {
      continue;
    }
    barracks.guardReserve = 0;
    barracks.guardReserveOriginTileIds = [];
    changedTileIds.push(barracks.id);
  }
  return changedTileIds;
}

function applyTownCenterCaptureTransfer(townCenter: Tile, previousOwnerSettlementId: string | null, attackerSettlementId: string, transferEntireSettlement: boolean) {
  const changedTileIds: string[] = [];
  for (const tile of Object.values(tileIndex)) {
    if (!tile.discovered || !tile.terrain) {
      continue;
    }
    if (!transferEntireSettlement && tile.id !== townCenter.id) {
      continue;
    }
    if (tile.id !== townCenter.id && tile.ownerSettlementId !== previousOwnerSettlementId && tile.controlledBySettlementId !== previousOwnerSettlementId) {
      continue;
    }
    if (tile.ownerSettlementId === attackerSettlementId && tile.controlledBySettlementId === attackerSettlementId) {
      continue;
    }
    tile.ownerSettlementId = attackerSettlementId;
    tile.controlledBySettlementId = attackerSettlementId;
    changedTileIds.push(tile.id);
  }
  return changedTileIds;
}

function settlementHasOtherTownCenter(settlementId: string | null | undefined, capturedTownCenterId: string) {
  if (!settlementId) {
    return false;
  }

  return Object.values(tileIndex).some((tile) => (
    tile.id !== capturedTownCenterId
    && isTownCenterTile(tile)
    && getTileSettlementId(tile) === settlementId
  ));
}

function settlementHasTownCenter(settlementId: string | null | undefined) {
  if (!settlementId) {
    return false;
  }

  return Object.values(tileIndex).some((tile) => isTownCenterTile(tile) && getTileSettlementId(tile) === settlementId);
}

function concludeRaid(
  townCenter: Tile,
  targetTile: Tile | null,
  survivingRaiders: number,
  returnSurvivorsToReserve: boolean,
) {
  if (returnSurvivorsToReserve && survivingRaiders > 0) {
    const returningOrigins = (townCenter.raidGuardOriginTileIds ?? []).slice(0, survivingRaiders);
    const changedReserveTiles = returnSettlementGuardReserve(getSettlementReserveTiles(), returningOrigins, townCenter.id);
    for (const tile of changedReserveTiles) {
      broadcastTile(tile);
    }
  }
  townCenter.raidCommittedGuards = 0;
  townCenter.raidGuardOriginTileIds = [];
  townCenter.raidTargetTileId = null;
  townCenter.raidBlockedReason = null;
  if (targetTile?.towerAttackerSettlementId === townCenter.id) {
    targetTile.towerAttackerSettlementId = null;
    targetTile.towerConflictState = resolveWatchtowerConflictState(targetTile);
    broadcastTile(targetTile);
  }
  broadcastTile(townCenter);
}

function processBarracksTraining(ctx: TickContext) {
  const guardTrainingProgress = ctx.dt * getGuardTrainingSpeedMultiplier(testModeSettings);

  for (const barracks of getBarracks()) {
    const settlementId = barracks.ownerSettlementId ?? barracks.controlledBySettlementId ?? null;
    const townCenter = getTownCenterTile(settlementId);
    if (!settlementId || !townCenter || (barracks.barracksTrainingQueue ?? 0) <= 0) {
      continue;
    }

    const previousProgress = Math.round(barracks.barracksTrainingProgressMs ?? 0);
    barracks.barracksTrainingProgressMs = Math.max(0, (barracks.barracksTrainingProgressMs ?? 0) + guardTrainingProgress);

    let completed = false;
    while ((barracks.barracksTrainingQueue ?? 0) > 0 && (barracks.barracksTrainingProgressMs ?? 0) >= GUARD_TRAINING_DURATION_MS) {
      const inventory = getSettlementResourceInventory(settlementId);
      if (getResourceRequirementStock(inventory, 'food') < GUARD_TRAINING_FOOD_COST || (inventory.weapons ?? 0) < GUARD_TRAINING_WEAPON_COST) {
        barracks.barracksTrainingProgressMs = GUARD_TRAINING_DURATION_MS;
        break;
      }

      const foodWithdrawals = withdrawFoodSourcesForSettlement(settlementId, GUARD_TRAINING_FOOD_COST);
      const weaponWithdrawals = withdrawResourceAcrossStoragesForSettlement(settlementId, 'weapons', GUARD_TRAINING_WEAPON_COST);

      barracks.barracksTrainingQueue = Math.max(0, (barracks.barracksTrainingQueue ?? 0) - 1);
      barracks.barracksTrainingProgressMs = Math.max(0, (barracks.barracksTrainingProgressMs ?? 0) - GUARD_TRAINING_DURATION_MS);
      barracks.guardReserve = getAvailableGuardReserve(barracks) + 1;
      townCenter.borderLockedUntilMs = Math.max(townCenter.borderLockedUntilMs ?? 0, ctx.now + BORDER_LOCKOUT_MS);
      completed = true;
      for (const withdrawal of foodWithdrawals) {
        broadcastWithdrawals(withdrawal.resourceType, withdrawal.transfers);
      }
      broadcastWithdrawals('weapons', weaponWithdrawals);
    }

    if (completed || previousProgress !== Math.round(barracks.barracksTrainingProgressMs ?? 0)) {
      broadcastTile(barracks);
      if (completed) {
        broadcastTile(townCenter);
      }
    }
  }
}

function processRaids(ctx: TickContext) {
  let territoryChanged = false;
  let settlersChanged = false;

  for (const attackerTownCenter of getTownCenters()) {
    const targetId = attackerTownCenter.raidTargetTileId ?? null;
    if (!targetId) {
      continue;
    }

    const targetTile = tileIndex[targetId] ?? null;
    const defenderSettlementId = getTileSettlementId(targetTile);
    const defenderTownCenter = getTownCenterTile(defenderSettlementId);
    const season = seasonState.getSnapshot();
    if (
      !targetTile
      || !isRaidableMilitaryTarget(targetTile)
      || !defenderSettlementId
      || defenderSettlementId === attackerTownCenter.id
      || !defenderTownCenter
      || getEffectiveSettlementBorderMode(attackerTownCenter, season) !== 'open'
      || getEffectiveSettlementBorderMode(defenderTownCenter, season) !== 'open'
    ) {
      concludeRaid(attackerTownCenter, targetTile, Math.max(0, attackerTownCenter.raidCommittedGuards ?? 0), true);
      continue;
    }

    ensureRaidTargetMilitaryState(targetTile);
    const previousState = roundedMilitaryValue(targetTile);
    const raidSettlers = getRaidSettlers(attackerTownCenter.id, targetTile.id);
    const engagedRaiders = raidSettlers.filter((settler) => isSettlerAtTower(settler, targetTile));
    const defenderSettlers = getDefenderSettlers(targetTile);
    const engagedDefenders = defenderSettlers.filter((settler) => isSettlerAtTower(settler, targetTile));
    const townCenterReserveDefenders = isTownCenterTile(targetTile) ? getSettlementGuardReserve(getSettlementReserveTiles(), defenderSettlementId) : 0;
    const activeDefenderCount = isTownCenterTile(targetTile)
      ? townCenterReserveDefenders
      : engagedDefenders.length;
    const blocked = !!attackerTownCenter.raidBlockedReason;
    const activeRaiders = Math.max(0, attackerTownCenter.raidCommittedGuards ?? 0);

    if (activeRaiders <= 0) {
      concludeRaid(attackerTownCenter, targetTile, 0, false);
      continue;
    }

    if (blocked) {
      targetTile.towerAttackerSettlementId = null;
    } else {
      targetTile.towerAttackerSettlementId = attackerTownCenter.id;
    }

    if (raidSettlers.length <= 0) {
      targetTile.towerConflictState = resolveWatchtowerConflictState(targetTile);
      if (previousState !== roundedMilitaryValue(targetTile)) {
        broadcastTile(targetTile);
        broadcastTile(attackerTownCenter);
      }
      continue;
    }

    if (!blocked && engagedRaiders.length > 0 && activeDefenderCount > 0) {
      targetTile.towerAttackerCasualtyProgress = Math.max(0, targetTile.towerAttackerCasualtyProgress ?? 0)
        + (((activeDefenderCount * 0.18) + ((targetTile.towerWallLevel ?? 0) * 0.08) + (getRaidDefenseScore(targetTile, activeDefenderCount) * 0.02)) * (ctx.dt / 1000));
      targetTile.towerDefenderCasualtyProgress = Math.max(0, targetTile.towerDefenderCasualtyProgress ?? 0)
        + (Math.max(0.1, (engagedRaiders.length * 0.22) - ((targetTile.towerWallLevel ?? 0) * 0.03)) * (ctx.dt / 1000));

      const attackerLosses = Math.min(
        engagedRaiders.length,
        Math.floor(targetTile.towerAttackerCasualtyProgress ?? 0),
      );
      const defenderLosses = Math.min(
        activeDefenderCount,
        Math.floor(targetTile.towerDefenderCasualtyProgress ?? 0),
      );

      if (attackerLosses > 0) {
        targetTile.towerAttackerCasualtyProgress = Math.max(0, (targetTile.towerAttackerCasualtyProgress ?? 0) - attackerLosses);
        settlersChanged = removeSettlersById(engagedRaiders.slice(0, attackerLosses).map((settler) => settler.id)) || settlersChanged;
        attackerTownCenter.raidCommittedGuards = Math.max(0, (attackerTownCenter.raidCommittedGuards ?? 0) - attackerLosses);
        attackerTownCenter.raidGuardOriginTileIds = (attackerTownCenter.raidGuardOriginTileIds ?? []).slice(attackerLosses);
      }

      if (defenderLosses > 0) {
        targetTile.towerDefenderCasualtyProgress = Math.max(0, (targetTile.towerDefenderCasualtyProgress ?? 0) - defenderLosses);
        if (isTownCenterTile(targetTile)) {
          const defenderOrigins = withdrawSettlementGuardReserve(getSettlementReserveTiles(), defenderSettlementId, defenderLosses);
          broadcastTileIds(defenderOrigins);
        } else {
          settlersChanged = removeSettlersById(engagedDefenders.slice(0, defenderLosses).map((settler) => settler.id)) || settlersChanged;
          targetTile.towerAssignedGuards = Math.max(0, (targetTile.towerAssignedGuards ?? 0) - defenderLosses);
          targetTile.towerGuardOriginTileIds = (targetTile.towerGuardOriginTileIds ?? []).slice(0, targetTile.towerAssignedGuards);
        }
      }
    } else if (!blocked && engagedRaiders.length > 0) {
      const targetRateMultiplier = isTownCenterTile(targetTile) ? TOWN_CENTER_RAID_CAPTURE_RATE_MULTIPLIER : 1;
      const deltaPerSecond = (Math.max(0.15, engagedRaiders.length * 0.45) * targetRateMultiplier) / (1 + ((targetTile.towerWallLevel ?? 0) * 0.5));
      const delta = deltaPerSecond * (ctx.dt / 1000);
      const fallbackDurability = isTownCenterTile(targetTile) ? TOWN_CENTER_MAX_DURABILITY : WATCHTOWER_MAX_DURABILITY;
      targetTile.towerCaptureProgress = Math.max(0, Math.min(100, (targetTile.towerCaptureProgress ?? 0) + delta));
      targetTile.towerDurability = Math.max(0, (targetTile.towerDurability ?? fallbackDurability) - (delta * 0.65));
      targetTile.towerAttackerCasualtyProgress = 0;
      targetTile.towerDefenderCasualtyProgress = 0;
    }

    if ((attackerTownCenter.raidCommittedGuards ?? 0) <= 0) {
      concludeRaid(attackerTownCenter, targetTile, 0, false);
      continue;
    }

    if ((targetTile.towerCaptureProgress ?? 0) >= 100) {
      const survivingRaiders = Math.max(0, attackerTownCenter.raidCommittedGuards ?? 0);
      const previousOwnerSettlementId = defenderSettlementId;
      const defeatedByTownCenterCapture = isTownCenterTile(targetTile)
        && !settlementHasOtherTownCenter(previousOwnerSettlementId, targetTile.id);
      const clearedDefenderReserveTileIds = defeatedByTownCenterCapture
        ? clearSettlementBarracksReserve(previousOwnerSettlementId)
        : [];
      targetTile.ownerSettlementId = attackerTownCenter.id;
      targetTile.controlledBySettlementId = attackerTownCenter.id;
      const transferredTileIds = isTownCenterTile(targetTile)
        ? applyTownCenterCaptureTransfer(targetTile, previousOwnerSettlementId, attackerTownCenter.id, defeatedByTownCenterCapture)
        : applyWatchtowerCaptureTransfer(targetTile, attackerTownCenter.id);
      targetTile.towerCaptureProgress = 0;
      targetTile.towerDurability = isTownCenterTile(targetTile) ? 90 : 40;
      targetTile.towerAssignedGuards = 0;
      targetTile.towerGuardOriginTileIds = [];
      targetTile.towerAttackerSettlementId = null;
      targetTile.towerAttackerCasualtyProgress = 0;
      targetTile.towerDefenderCasualtyProgress = 0;
      targetTile.towerConflictState = 'captured';
      if (isTownCenterTile(targetTile)) {
        targetTile.borderMode = 'open';
        targetTile.guardReserve = 0;
        targetTile.guardReserveOriginTileIds = [];
        targetTile.raidTargetTileId = null;
        targetTile.raidCommittedGuards = 0;
        targetTile.raidGuardOriginTileIds = [];
        targetTile.raidBlockedReason = null;
      }
      concludeRaid(attackerTownCenter, targetTile, survivingRaiders, true);
      attackerTownCenter.borderLockedUntilMs = ctx.now + BORDER_LOCKOUT_MS;
      defenderTownCenter.borderLockedUntilMs = ctx.now + BORDER_LOCKOUT_MS;
      broadcastTile(defenderTownCenter);
      for (const tileId of transferredTileIds) {
        const tile = tileIndex[tileId];
        if (tile) {
          broadcastTile(tile);
        }
      }
      broadcastTileIds(clearedDefenderReserveTileIds);
      territoryChanged = true;
      emitGameplayEvent({
        type: 'military:tower_captured',
        towerTileId: targetTile.id,
        attackerSettlementId: attackerTownCenter.id,
        defenderSettlementId: previousOwnerSettlementId,
        transferredTileIds,
      });
      if (isTownCenterTile(targetTile) && previousOwnerSettlementId && !settlementHasTownCenter(previousOwnerSettlementId)) {
        const defeatedTransferTileIds = [targetTile.id, ...transferredTileIds.filter((tileId) => tileId !== targetTile.id)];
        emitGameplayEvent({
          type: 'military:settlement_defeated',
          defeatedSettlementId: previousOwnerSettlementId,
          attackerSettlementId: attackerTownCenter.id,
          capturedTownCenterTileId: targetTile.id,
          transferredTileIds: defeatedTransferTileIds,
          defeatedAt: ctx.now,
        });
      }
      continue;
    }

    targetTile.towerConflictState = resolveWatchtowerConflictState(targetTile);
    if (previousState !== roundedMilitaryValue(targetTile)) {
      broadcastTile(targetTile);
      broadcastTile(attackerTownCenter);
    }
  }

  const raidTargets = Object.values(tileIndex)
    .filter((tile) => isRaidableMilitaryTarget(tile))
    .map((tile) => ensureRaidTargetMilitaryState(tile)!);

  for (const targetTile of raidTargets) {
    const before = roundedMilitaryValue(targetTile);
    if (!!targetTile.towerAttackerSettlementId) {
      const attackerTownCenter = getTownCenterTile(targetTile.towerAttackerSettlementId);
      if (!attackerTownCenter || attackerTownCenter.raidTargetTileId !== targetTile.id || getEffectiveSettlementBorderMode(attackerTownCenter, seasonState.getSnapshot()) !== 'open') {
        targetTile.towerAttackerSettlementId = null;
      }
    }

    if (!targetTile.towerAttackerSettlementId) {
      const recoveryRate = (0.2 + (targetTile.towerAssignedGuards ?? 0) * 0.08 + (targetTile.towerWallLevel ?? 0) * 0.05) * (ctx.dt / 1000);
      const fallbackDurability = isTownCenterTile(targetTile) ? TOWN_CENTER_MAX_DURABILITY : WATCHTOWER_MAX_DURABILITY;
      targetTile.towerCaptureProgress = Math.max(0, (targetTile.towerCaptureProgress ?? 0) - recoveryRate * 2);
      targetTile.towerDurability = Math.min(targetTile.towerDurabilityMax ?? fallbackDurability, (targetTile.towerDurability ?? fallbackDurability) + recoveryRate);
      targetTile.towerAttackerCasualtyProgress = 0;
      targetTile.towerDefenderCasualtyProgress = 0;
    }

    targetTile.towerConflictState = resolveWatchtowerConflictState(targetTile);
    if (before !== roundedMilitaryValue(targetTile)) {
      broadcastTile(targetTile);
    }
  }

  if (territoryChanged) {
    syncTerritory();
  }
  if (settlersChanged) {
    broadcast({
      type: 'settlers:update',
      settlers: settlers.map((settler) => ({ ...settler, movement: settler.movement ? {
        path: settler.movement.path.map((step) => ({ ...step })),
        origin: { ...settler.movement.origin },
        target: { ...settler.movement.target },
        startMs: settler.movement.startMs,
        stepDurations: settler.movement.stepDurations.slice(),
        cumulative: settler.movement.cumulative.slice(),
        taskType: settler.movement.taskType,
        requestId: settler.movement.requestId,
        authoritative: settler.movement.authoritative,
      } : undefined })),
      timestamp: ctx.now,
    });
  }
}

export const militarySystem = {
  name: 'military',
  intervalMs: 1_000,
  tick: (ctx: TickContext) => {
    if (seasonState.isCompleted()) {
      return;
    }
    processBarracksTraining(ctx);
    processRaids(ctx);
  },
};

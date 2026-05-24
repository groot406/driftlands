import type { TickContext } from '../tick';
import { tileIndex } from '../../../src/shared/game/world.ts';
import {
  BORDER_LOCKOUT_MS,
  GUARD_TRAINING_DURATION_MS,
  GUARD_TRAINING_FOOD_COST,
  GUARD_TRAINING_WEAPON_COST,
  WATCHTOWER_MAX_DURABILITY,
  ensureBarracksMilitaryState,
  ensureTownCenterMilitaryState,
  ensureWatchtowerMilitaryState,
  getAvailableGuardReserve,
  getEffectiveSettlementBorderMode,
  getWatchtowerDefenseScore,
  isBarracksTile,
  isProtectedByTownCenter,
  isTownCenterTile,
  isWatchtowerTile,
  resolveWatchtowerConflictState,
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

function getTownCenters() {
  return Object.values(tileIndex).filter((tile) => isTownCenterTile(tile)).map((tile) => ensureTownCenterMilitaryState(tile)!);
}

function getWatchtowers() {
  return Object.values(tileIndex).filter((tile) => isWatchtowerTile(tile)).map((tile) => ensureWatchtowerMilitaryState(tile)!);
}

function getBarracks() {
  return Object.values(tileIndex).filter((tile) => isBarracksTile(tile)).map((tile) => ensureBarracksMilitaryState(tile)!);
}

function getTownCenterTile(settlementId: string | null | undefined) {
  if (!settlementId) {
    return null;
  }

  const tile = tileIndex[settlementId] ?? null;
  return isTownCenterTile(tile) ? ensureTownCenterMilitaryState(tile) : null;
}

function roundedMilitaryValue(tile: Tile) {
  return `${Math.round(tile.towerDurability ?? WATCHTOWER_MAX_DURABILITY)}:${Math.round(tile.towerCaptureProgress ?? 0)}:${tile.towerConflictState ?? 'active'}:${tile.ownerSettlementId ?? ''}:${tile.towerAttackerSettlementId ?? ''}:${tile.towerAssignedGuards ?? 0}`;
}

function broadcastTile(tile: Tile) {
  broadcast({
    type: 'tile:updated',
    tile,
    timestamp: Date.now(),
  } satisfies TileUpdatedMessage);
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

function getRaidSettlers(settlementId: string, targetTowerId: string) {
  return settlers
    .filter((settler) => settler.assignedRole === 'guard' && settler.settlementId === settlementId && settler.guardTowerTileId === targetTowerId)
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

function concludeRaid(
  townCenter: Tile,
  targetTower: Tile | null,
  survivingRaiders: number,
  returnSurvivorsToReserve: boolean,
) {
  if (returnSurvivorsToReserve && survivingRaiders > 0) {
    townCenter.guardReserve = getAvailableGuardReserve(townCenter) + survivingRaiders;
  }
  townCenter.raidCommittedGuards = 0;
  townCenter.raidTargetTileId = null;
  townCenter.raidBlockedReason = null;
  if (targetTower?.towerAttackerSettlementId === townCenter.id) {
    targetTower.towerAttackerSettlementId = null;
    targetTower.towerConflictState = resolveWatchtowerConflictState(targetTower);
    broadcastTile(targetTower);
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
      townCenter.guardReserve = getAvailableGuardReserve(townCenter) + 1;
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

    const targetTower = tileIndex[targetId] ?? null;
    const defenderTownCenter = getTownCenterTile(targetTower?.ownerSettlementId ?? null);
    const season = seasonState.getSnapshot();
    if (
      !targetTower
      || !isWatchtowerTile(targetTower)
      || !defenderTownCenter
      || getEffectiveSettlementBorderMode(attackerTownCenter, season) !== 'open'
      || getEffectiveSettlementBorderMode(defenderTownCenter, season) !== 'open'
      || isProtectedByTownCenter(targetTower, defenderTownCenter)
    ) {
      concludeRaid(attackerTownCenter, targetTower, Math.max(0, attackerTownCenter.raidCommittedGuards ?? 0), true);
      continue;
    }

    const previousState = roundedMilitaryValue(targetTower);
    const raidSettlers = getRaidSettlers(attackerTownCenter.id, targetTower.id);
    const engagedRaiders = raidSettlers.filter((settler) => isSettlerAtTower(settler, targetTower));
    const defenderSettlers = getDefenderSettlers(targetTower);
    const engagedDefenders = defenderSettlers.filter((settler) => isSettlerAtTower(settler, targetTower));
    const blocked = !!attackerTownCenter.raidBlockedReason;
    const activeRaiders = Math.max(0, attackerTownCenter.raidCommittedGuards ?? 0);

    if (activeRaiders <= 0) {
      concludeRaid(attackerTownCenter, targetTower, 0, false);
      continue;
    }

    if (blocked) {
      targetTower.towerAttackerSettlementId = null;
    } else {
      targetTower.towerAttackerSettlementId = attackerTownCenter.id;
    }

    if (raidSettlers.length <= 0) {
      targetTower.towerConflictState = resolveWatchtowerConflictState(targetTower);
      if (previousState !== roundedMilitaryValue(targetTower)) {
        broadcastTile(targetTower);
        broadcastTile(attackerTownCenter);
      }
      continue;
    }

    if (!blocked && engagedRaiders.length > 0 && (targetTower.towerAssignedGuards ?? 0) > 0 && engagedDefenders.length > 0) {
      targetTower.towerAttackerCasualtyProgress = Math.max(0, targetTower.towerAttackerCasualtyProgress ?? 0)
        + (((engagedDefenders.length * 0.18) + ((targetTower.towerWallLevel ?? 0) * 0.08) + (getWatchtowerDefenseScore(targetTower) * 0.02)) * (ctx.dt / 1000));
      targetTower.towerDefenderCasualtyProgress = Math.max(0, targetTower.towerDefenderCasualtyProgress ?? 0)
        + (Math.max(0.1, (engagedRaiders.length * 0.22) - ((targetTower.towerWallLevel ?? 0) * 0.03)) * (ctx.dt / 1000));

      const attackerLosses = Math.min(
        engagedRaiders.length,
        Math.floor(targetTower.towerAttackerCasualtyProgress ?? 0),
      );
      const defenderLosses = Math.min(
        engagedDefenders.length,
        Math.floor(targetTower.towerDefenderCasualtyProgress ?? 0),
      );

      if (attackerLosses > 0) {
        targetTower.towerAttackerCasualtyProgress = Math.max(0, (targetTower.towerAttackerCasualtyProgress ?? 0) - attackerLosses);
        settlersChanged = removeSettlersById(engagedRaiders.slice(0, attackerLosses).map((settler) => settler.id)) || settlersChanged;
        attackerTownCenter.raidCommittedGuards = Math.max(0, (attackerTownCenter.raidCommittedGuards ?? 0) - attackerLosses);
      }

      if (defenderLosses > 0) {
        targetTower.towerDefenderCasualtyProgress = Math.max(0, (targetTower.towerDefenderCasualtyProgress ?? 0) - defenderLosses);
        settlersChanged = removeSettlersById(engagedDefenders.slice(0, defenderLosses).map((settler) => settler.id)) || settlersChanged;
        targetTower.towerAssignedGuards = Math.max(0, (targetTower.towerAssignedGuards ?? 0) - defenderLosses);
      }
    } else if (!blocked && engagedRaiders.length > 0) {
      const deltaPerSecond = Math.max(0.15, engagedRaiders.length * 0.45) / (1 + ((targetTower.towerWallLevel ?? 0) * 0.5));
      const delta = deltaPerSecond * (ctx.dt / 1000);
      targetTower.towerCaptureProgress = Math.max(0, Math.min(100, (targetTower.towerCaptureProgress ?? 0) + delta));
      targetTower.towerDurability = Math.max(0, (targetTower.towerDurability ?? WATCHTOWER_MAX_DURABILITY) - (delta * 0.65));
      targetTower.towerAttackerCasualtyProgress = 0;
      targetTower.towerDefenderCasualtyProgress = 0;
    }

    if ((attackerTownCenter.raidCommittedGuards ?? 0) <= 0) {
      concludeRaid(attackerTownCenter, targetTower, 0, false);
      continue;
    }

    if ((targetTower.towerCaptureProgress ?? 0) >= 100) {
      const survivingRaiders = Math.max(0, attackerTownCenter.raidCommittedGuards ?? 0);
      const previousOwnerSettlementId = targetTower.ownerSettlementId ?? null;
      targetTower.ownerSettlementId = attackerTownCenter.id;
      targetTower.controlledBySettlementId = attackerTownCenter.id;
      const transferredTileIds = applyWatchtowerCaptureTransfer(targetTower, attackerTownCenter.id);
      targetTower.towerCaptureProgress = 0;
      targetTower.towerDurability = 40;
      targetTower.towerAssignedGuards = 0;
      targetTower.towerAttackerSettlementId = null;
      targetTower.towerAttackerCasualtyProgress = 0;
      targetTower.towerDefenderCasualtyProgress = 0;
      targetTower.towerConflictState = 'captured';
      concludeRaid(attackerTownCenter, targetTower, survivingRaiders, true);
      attackerTownCenter.borderLockedUntilMs = ctx.now + BORDER_LOCKOUT_MS;
      defenderTownCenter.borderLockedUntilMs = ctx.now + BORDER_LOCKOUT_MS;
      broadcastTile(defenderTownCenter);
      for (const tileId of transferredTileIds) {
        const tile = tileIndex[tileId];
        if (tile) {
          broadcastTile(tile);
        }
      }
      territoryChanged = true;
      emitGameplayEvent({
        type: 'military:tower_captured',
        towerTileId: targetTower.id,
        attackerSettlementId: attackerTownCenter.id,
        defenderSettlementId: previousOwnerSettlementId,
        transferredTileIds,
      });
      continue;
    }

    targetTower.towerConflictState = resolveWatchtowerConflictState(targetTower);
    if (previousState !== roundedMilitaryValue(targetTower)) {
      broadcastTile(targetTower);
      broadcastTile(attackerTownCenter);
    }
  }

  for (const tower of getWatchtowers()) {
    const before = roundedMilitaryValue(tower);
    if (!!tower.towerAttackerSettlementId) {
      const attackerTownCenter = getTownCenterTile(tower.towerAttackerSettlementId);
      if (!attackerTownCenter || attackerTownCenter.raidTargetTileId !== tower.id || getEffectiveSettlementBorderMode(attackerTownCenter, seasonState.getSnapshot()) !== 'open') {
        tower.towerAttackerSettlementId = null;
      }
    }

    if (!tower.towerAttackerSettlementId) {
      const recoveryRate = (0.2 + (tower.towerAssignedGuards ?? 0) * 0.08 + (tower.towerWallLevel ?? 0) * 0.05) * (ctx.dt / 1000);
      tower.towerCaptureProgress = Math.max(0, (tower.towerCaptureProgress ?? 0) - recoveryRate * 2);
      tower.towerDurability = Math.min(tower.towerDurabilityMax ?? WATCHTOWER_MAX_DURABILITY, (tower.towerDurability ?? WATCHTOWER_MAX_DURABILITY) + recoveryRate);
      tower.towerAttackerCasualtyProgress = 0;
      tower.towerDefenderCasualtyProgress = 0;
    }

    tower.towerConflictState = resolveWatchtowerConflictState(tower);
    if (before !== roundedMilitaryValue(tower)) {
      broadcastTile(tower);
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

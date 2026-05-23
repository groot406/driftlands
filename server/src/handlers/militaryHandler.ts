import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';
import { tileIndex } from '../../../src/shared/game/world.ts';
import {
  BORDER_LOCKOUT_MS,
  BORDER_MODE_COOLDOWN_MS,
  WATCHTOWER_PALISADE_WALL_LEVEL,
  WATCHTOWER_PALISADE_WOOD_COST,
  ensureBarracksMilitaryState,
  ensureTownCenterMilitaryState,
  ensureWatchtowerMilitaryState,
  getAvailableGuardReserve,
  getEffectiveSettlementBorderMode,
  isBarracksTile,
  isProtectedByTownCenter,
  isTownCenterTile,
  isWatchtowerTile,
  resolveWatchtowerConflictState,
} from '../../../src/shared/game/military.ts';
import type {
  MilitaryAssignGuardsMessage,
  MilitaryBuildPalisadeMessage,
  MilitaryQueueGuardTrainingMessage,
  MilitarySetRaidTargetMessage,
  ResourceWithdrawMessage,
  SettlementSetBorderModeMessage,
  TileUpdatedMessage,
} from '../../../src/shared/protocol.ts';
import { playerSettlementState } from '../state/playerSettlementState';
import { getTileSettlementId } from '../../../src/shared/game/settlement.ts';
import { isStudyCompleted } from '../../../src/store/studyStore.ts';
import { withdrawResourceAcrossStoragesForSettlement } from '../../../src/store/resourceStore.ts';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { seasonState } from '../state/seasonState';

function canManageTile(
  tile: Pick<Tile, 'id' | 'terrain' | 'ownerSettlementId' | 'controlledBySettlementId'> | null | undefined,
  settlementId: string | null | undefined,
) {
  if (!tile || !settlementId) {
    return false;
  }

  if (tile.terrain === 'towncenter') {
    return getTileSettlementId(tile) === settlementId;
  }

  if (tile.ownerSettlementId) {
    return tile.ownerSettlementId === settlementId;
  }

  return tile.controlledBySettlementId === settlementId;
}

function getTownCenterTile(settlementId: string | null | undefined) {
  if (!settlementId) {
    return null;
  }

  const tile = tileIndex[settlementId] ?? null;
  return isTownCenterTile(tile) ? ensureTownCenterMilitaryState(tile) : null;
}

function getOwnedWatchtowers(settlementId: string) {
  return Object.values(tileIndex).filter((tile) => isWatchtowerTile(tile) && tile.ownerSettlementId === settlementId);
}

function broadcastTile(tileId: string | null | undefined) {
  if (!tileId) {
    return;
  }

  const tile = tileIndex[tileId];
  if (!tile) {
    return;
  }

  broadcast({
    type: 'tile:updated',
    tile,
    timestamp: Date.now(),
  } satisfies TileUpdatedMessage);
}

function broadcastWoodWithdrawals(withdrawals: ReturnType<typeof withdrawResourceAcrossStoragesForSettlement>) {
  for (const withdrawal of withdrawals) {
    broadcast({
      type: 'resource:withdraw',
      heroId: 'tower-palisade',
      storageTileId: withdrawal.storageTileId,
      resource: {
        type: 'wood',
        amount: withdrawal.amount,
      },
    } satisfies ResourceWithdrawMessage);
  }
}

export class ServerMilitaryHandler {
  constructor(_io: Server) {}

  init(): void {
    serverMessageRouter.on('settlement:set_border_mode', this.handleSetBorderMode.bind(this));
    serverMessageRouter.on('military:queue_guard_training', this.handleQueueGuardTraining.bind(this));
    serverMessageRouter.on('military:assign_guards', this.handleAssignGuards.bind(this));
    serverMessageRouter.on('military:build_palisade', this.handleBuildPalisade.bind(this));
    serverMessageRouter.on('military:set_raid_target', this.handleSetRaidTarget.bind(this));
  }

  private resolveSettlementId(socket: Socket) {
    const playerId = playerSettlementState.getSocketPlayerId(socket.id);
    return playerSettlementState.getPlayerSettlement(playerId ?? '');
  }

  private isSpectator(socket: Socket) {
    return playerSettlementState.isSocketSpectator(socket.id);
  }

  private handleSetBorderMode(socket: Socket, message: SettlementSetBorderModeMessage) {
    if (this.isSpectator(socket)) {
      return;
    }

    const settlementId = this.resolveSettlementId(socket);
    if (!settlementId || settlementId !== message.settlementId || !isStudyCompleted('border_management', settlementId) || seasonState.getEffectiveBorderPolicy() !== 'player_choice') {
      return;
    }

    const townCenter = getTownCenterTile(settlementId);
    if (!townCenter || townCenter.borderMode === message.borderMode) {
      return;
    }

    const now = Date.now();
    if ((townCenter.borderModeCooldownUntilMs ?? 0) > now) {
      return;
    }

    if (message.borderMode === 'closed') {
      const contested = getOwnedWatchtowers(settlementId).some((tower) => (tower.towerCaptureProgress ?? 0) > 0 || !!tower.towerAttackerSettlementId);
      if (contested || !!townCenter.raidTargetTileId || (townCenter.borderLockedUntilMs ?? 0) > now) {
        return;
      }
    }

    townCenter.borderMode = message.borderMode;
    townCenter.borderModeCooldownUntilMs = now + BORDER_MODE_COOLDOWN_MS;
    townCenter.borderLockedUntilMs = now + BORDER_LOCKOUT_MS;
    if (message.borderMode === 'closed') {
      townCenter.raidTargetTileId = null;
    }

    broadcastTile(townCenter.id);
  }

  private handleQueueGuardTraining(socket: Socket, message: MilitaryQueueGuardTrainingMessage) {
    if (!seasonState.allowsNewHeroActions()) {
      return;
    }
    if (this.isSpectator(socket)) {
      return;
    }

    const settlementId = this.resolveSettlementId(socket);
    const barracks = tileIndex[message.barracksTileId] ?? null;
    if (!settlementId || !isBarracksTile(barracks) || !canManageTile(barracks, settlementId) || !isStudyCompleted('guard_training', settlementId)) {
      return;
    }

    ensureBarracksMilitaryState(barracks);
    barracks.barracksTrainingQueue = Math.max(0, barracks.barracksTrainingQueue ?? 0) + Math.max(1, Math.trunc(message.quantity ?? 1));
    broadcastTile(barracks.id);
  }

  private handleAssignGuards(socket: Socket, message: MilitaryAssignGuardsMessage) {
    if (!seasonState.allowsNewHeroActions()) {
      return;
    }
    if (this.isSpectator(socket)) {
      return;
    }

    const settlementId = this.resolveSettlementId(socket);
    const tower = tileIndex[message.tileId] ?? null;
    const townCenter = getTownCenterTile(settlementId);
    if (!settlementId || !tower || !townCenter || !isWatchtowerTile(tower) || !canManageTile(tower, settlementId)) {
      return;
    }

    ensureWatchtowerMilitaryState(tower);
    const delta = Math.trunc(message.delta);
    if (delta === 0) {
      return;
    }

    if (delta > 0) {
      const reserve = getAvailableGuardReserve(townCenter);
      if (reserve < delta) {
        return;
      }

      townCenter.guardReserve = reserve - delta;
      tower.towerAssignedGuards = Math.max(0, (tower.towerAssignedGuards ?? 0) + delta);
    } else {
      const removeCount = Math.min(Math.abs(delta), tower.towerAssignedGuards ?? 0);
      if (removeCount <= 0) {
        return;
      }

      tower.towerAssignedGuards = Math.max(0, (tower.towerAssignedGuards ?? 0) - removeCount);
      townCenter.guardReserve = getAvailableGuardReserve(townCenter) + removeCount;
    }

    broadcastTile(townCenter.id);
    broadcastTile(tower.id);
  }

  private handleBuildPalisade(socket: Socket, message: MilitaryBuildPalisadeMessage) {
    if (!seasonState.allowsNewHeroActions()) {
      return;
    }
    if (this.isSpectator(socket)) {
      return;
    }

    const settlementId = this.resolveSettlementId(socket);
    const tower = tileIndex[message.tileId] ?? null;
    if (!settlementId || !tower || !isWatchtowerTile(tower) || !canManageTile(tower, settlementId) || !isStudyCompleted('defensive_construction', settlementId)) {
      return;
    }

    ensureWatchtowerMilitaryState(tower);
    if ((tower.towerWallLevel ?? 0) >= WATCHTOWER_PALISADE_WALL_LEVEL) {
      return;
    }

    const withdrawals = withdrawResourceAcrossStoragesForSettlement(settlementId, 'wood', WATCHTOWER_PALISADE_WOOD_COST);
    const withdrawnAmount = withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    if (withdrawnAmount < WATCHTOWER_PALISADE_WOOD_COST) {
      return;
    }

    tower.towerWallLevel = WATCHTOWER_PALISADE_WALL_LEVEL;
    broadcastWoodWithdrawals(withdrawals);
    broadcastTile(tower.id);
  }

  private handleSetRaidTarget(socket: Socket, message: MilitarySetRaidTargetMessage) {
    if (!seasonState.allowsNewHeroActions()) {
      return;
    }
    if (this.isSpectator(socket)) {
      return;
    }

    const settlementId = this.resolveSettlementId(socket);
    const townCenter = getTownCenterTile(settlementId);
    const season = seasonState.getSnapshot();
    if (!settlementId || !townCenter || settlementId !== message.settlementId || getEffectiveSettlementBorderMode(townCenter, season) !== 'open') {
      return;
    }

    const previousTarget = townCenter.raidTargetTileId ? tileIndex[townCenter.raidTargetTileId] ?? null : null;
    if (!message.targetTileId) {
      const returningRaiders = Math.max(0, townCenter.raidCommittedGuards ?? 0);
      townCenter.raidTargetTileId = null;
      townCenter.raidBlockedReason = null;
      townCenter.guardReserve = getAvailableGuardReserve(townCenter) + returningRaiders;
      townCenter.raidCommittedGuards = 0;
      if (previousTarget && isWatchtowerTile(previousTarget) && previousTarget.towerAttackerSettlementId === settlementId) {
        previousTarget.towerAttackerSettlementId = null;
        previousTarget.towerConflictState = resolveWatchtowerConflictState(previousTarget);
        broadcastTile(previousTarget.id);
      }
      broadcastTile(townCenter.id);
      return;
    }

    const targetTile = tileIndex[message.targetTileId] ?? null;
    if (!targetTile || !isWatchtowerTile(targetTile) || targetTile.ownerSettlementId === settlementId) {
      return;
    }

    const defenderTownCenter = getTownCenterTile(targetTile.ownerSettlementId ?? null);
    if (!defenderTownCenter || getEffectiveSettlementBorderMode(defenderTownCenter, season) !== 'open' || isProtectedByTownCenter(targetTile, defenderTownCenter)) {
      return;
    }

    if (getAvailableGuardReserve(townCenter) <= 0) {
      return;
    }

    if (previousTarget && isWatchtowerTile(previousTarget) && previousTarget.id !== targetTile.id && previousTarget.towerAttackerSettlementId === settlementId) {
      previousTarget.towerAttackerSettlementId = null;
      previousTarget.towerConflictState = resolveWatchtowerConflictState(previousTarget);
      broadcastTile(previousTarget.id);
    }

    ensureWatchtowerMilitaryState(targetTile);
    if ((townCenter.raidCommittedGuards ?? 0) <= 0) {
      const committedGuards = getAvailableGuardReserve(townCenter);
      if (committedGuards <= 0) {
        return;
      }
      townCenter.guardReserve = 0;
      townCenter.raidCommittedGuards = committedGuards;
    }
    townCenter.raidTargetTileId = targetTile.id;
    townCenter.raidBlockedReason = null;
    townCenter.borderLockedUntilMs = Date.now() + BORDER_LOCKOUT_MS;
    targetTile.towerAttackerSettlementId = settlementId;
    targetTile.towerConflictState = resolveWatchtowerConflictState(targetTile);
    broadcastTile(targetTile.id);
    broadcastTile(townCenter.id);
  }
}

import type {
  SettlementFoundResultMessage,
  SettlementPlayerFoundMessage,
  SettlementStartOptionsMessage,
} from '../../shared/protocol.ts';
import { addNotification } from '../../store/notificationStore.ts';
import { applySettlementFoundResult, replaceSettlementStartOptions, upsertSettlementStartMarker } from '../../store/settlementStartStore.ts';
import { jumpCamera } from '../camera.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { currentPlayerId } from '../socket.ts';

class SettlementStartHandler {
  private initialized = false;

  private focusCameraOnSettlement(settlementId: string | null, settlements: Array<{ settlementId: string; q: number; r: number }>): void {
    if (!settlementId) {
      return;
    }

    const settlement = settlements.find((marker) => marker.settlementId === settlementId);
    if (!settlement) {
      return;
    }

    jumpCamera(settlement.q, settlement.r);
  }

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('settlement:start_options', this.handleStartOptions.bind(this));
    clientMessageRouter.on('settlement:found_result', this.handleFoundResult.bind(this));
    clientMessageRouter.on('settlement:player_found', this.handlePlayerFound.bind(this));
  }

  private handleStartOptions(message: SettlementStartOptionsMessage): void {
    if (message.playerId !== currentPlayerId.value) {
      return;
    }

    replaceSettlementStartOptions({
      currentSettlementId: message.currentSettlementId,
      candidates: message.candidates,
      settlements: message.settlements,
      ...(message.terrainTiles ? { terrainTiles: message.terrainTiles } : {}),
    });
    this.focusCameraOnSettlement(message.currentSettlementId, message.settlements);
  }

  private handleFoundResult(message: SettlementFoundResultMessage): void {
    if (message.playerId !== currentPlayerId.value) {
      return;
    }

    applySettlementFoundResult({
      success: message.success,
      settlementId: message.settlementId,
      message: message.message,
    });

  }

  private handlePlayerFound(message: SettlementPlayerFoundMessage): void {
    upsertSettlementStartMarker({
      settlementId: message.settlementId,
      q: message.q,
      r: message.r,
      playerId: message.playerId,
      playerName: message.playerName,
      playerColor: message.playerColor ?? null,
    });

    if (message.playerId === currentPlayerId.value) {
      jumpCamera(message.q, message.r);
      addNotification({
        type: 'settlement',
        title: 'Settlement founded',
        message: 'Your town center is ready.',
      });
      return;
    }

    addNotification({
      type: 'settlement',
      title: 'New settlement',
      message: `${message.playerName} founded a settlement.`,
    });
  }
}

export const settlementStartHandler = new SettlementStartHandler();

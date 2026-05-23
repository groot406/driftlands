import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import { playerSettlementState } from '../state/playerSettlementState';
import { shipOrderState } from '../state/shipOrderState';
import type { ShipOrderLoadMessage } from '../../../src/shared/protocol.ts';
import { seasonState } from '../state/seasonState';

export class ServerShipOrderHandler {
  constructor(_io: Server) {}

  init(): void {
    serverMessageRouter.on('ship_order:load', this.handleLoad.bind(this));
  }

  private handleLoad(socket: Socket, message: ShipOrderLoadMessage) {
    if (!seasonState.allowsNewHeroActions()) {
      return;
    }
    if (playerSettlementState.isSocketSpectator(socket.id)) {
      return;
    }

    const playerId = playerSettlementState.getSocketPlayerId(socket.id);
    const settlementId = playerId ? playerSettlementState.getPlayerSettlement(playerId) : null;
    if (!playerId || !settlementId || settlementId !== message.settlementId) {
      return;
    }

    shipOrderState.loadCargo({
      orderId: message.orderId,
      settlementId,
      playerId,
      playerName: playerSettlementState.getPlayerName(playerId),
      resources: message.resources ?? {},
    });
  }
}

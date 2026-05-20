import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import { playerSettlementState } from '../state/playerSettlementState';
import { shipOrderState } from '../state/shipOrderState';
import type { ShipOrderContributeMessage } from '../../../src/shared/protocol.ts';

export class ServerShipOrderHandler {
  constructor(_io: Server) {}

  init(): void {
    serverMessageRouter.on('ship_order:contribute', this.handleContribute.bind(this));
  }

  private handleContribute(socket: Socket, message: ShipOrderContributeMessage) {
    const playerId = playerSettlementState.getSocketPlayerId(socket.id);
    const settlementId = playerId ? playerSettlementState.getPlayerSettlement(playerId) : null;
    if (!playerId || !settlementId || settlementId !== message.settlementId) {
      return;
    }

    shipOrderState.contribute({
      settlementId,
      playerId,
      playerName: playerSettlementState.getPlayerName(playerId),
      resources: message.resources ?? {},
    });
  }
}

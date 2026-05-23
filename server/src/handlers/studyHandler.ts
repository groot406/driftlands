import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import type { SetActiveStudyMessage } from '../../../src/shared/protocol.ts';
import { broadcastStudyState, selectActiveStudy } from '../../../src/store/studyStore.ts';
import { refreshWorkforceState } from '../systems/jobSystem';
import { playerSettlementState } from '../state/playerSettlementState';

export class ServerStudyHandler {
    constructor(_io: Server) {}

    init(): void {
        serverMessageRouter.on('studies:set_active', this.handleSetActiveStudy.bind(this));
    }

    private handleSetActiveStudy(socket: Socket, message: SetActiveStudyMessage): void {
        if (playerSettlementState.isSocketSpectator(socket.id)) {
            return;
        }

        const playerId = playerSettlementState.getSocketPlayerId(socket.id);
        const settlementId = playerId ? playerSettlementState.getPlayerSettlement(playerId) : null;
        const requestedSettlementId = message.settlementId ?? settlementId;
        if (!settlementId || requestedSettlementId !== settlementId || !selectActiveStudy(message.studyKey, settlementId)) {
            return;
        }

        broadcastStudyState(settlementId);
        refreshWorkforceState();
    }
}

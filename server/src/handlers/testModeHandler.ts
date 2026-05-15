import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import type { TestRunActionMessage, TestSetSettingsMessage } from '../../../src/shared/protocol.ts';
import { playerSettlementState } from '../state/playerSettlementState';
import { testModeState } from '../state/testModeState';

export class ServerTestModeHandler {
    constructor(_io: Server) {}

    init(): void {
        serverMessageRouter.on('test:set_settings', this.handleSetSettings.bind(this));
        serverMessageRouter.on('test:run_action', this.handleRunAction.bind(this));
    }

    private handleSetSettings(socket: Socket, message: TestSetSettingsMessage): void {
        const playerId = playerSettlementState.getSocketPlayerId(socket.id);
        const settlementId = message.settlementId ?? (playerId ? playerSettlementState.getPlayerSettlement(playerId) : null);
        testModeState.applySettings({
            ...message,
            settlementId,
        });
    }

    private handleRunAction(socket: Socket, message: TestRunActionMessage): void {
        const playerId = playerSettlementState.getSocketPlayerId(socket.id);
        const settlementId = message.settlementId ?? (playerId ? playerSettlementState.getPlayerSettlement(playerId) : null);
        testModeState.applyAction({
            ...message,
            settlementId,
        });
    }
}

import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import type { SetActiveStudyMessage } from '../../../src/shared/protocol.ts';
import { broadcastStudyState, selectActiveStudy } from '../../../src/store/studyStore.ts';
import { refreshWorkforceState } from '../systems/jobSystem';

export class ServerStudyHandler {
    constructor(_io: Server) {}

    init(): void {
        serverMessageRouter.on('studies:set_active', this.handleSetActiveStudy.bind(this));
    }

    private handleSetActiveStudy(_socket: Socket, message: SetActiveStudyMessage): void {
        if (!selectActiveStudy(message.studyKey)) {
            return;
        }

        broadcastStudyState();
        refreshWorkforceState();
    }
}

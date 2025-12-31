import type {Server, Socket} from 'socket.io';
import {serverMessageRouter} from '../messages/messageRouter';
import type {StartTaskRequestMessage } from '../../../src/shared/protocol';
import {updateActiveTasks} from "../../../src/store/taskStore";
import {heroes} from "../../../src/store/heroStore";

export class ServerTaskHandler {
    constructor(private io: Server) {
    }

    init(): void {
        setInterval(this.tick.bind(this), 500);
        serverMessageRouter.on('task:request_start', this.handleStartRequest.bind(this));
    }

    private handleStartRequest(socket: Socket, message: StartTaskRequestMessage): void {
        console.log(`Received task start request:`, message);
    }
    private tick(): void {
        updateActiveTasks(heroes)
    }
}

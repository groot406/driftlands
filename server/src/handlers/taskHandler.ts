import type {Server, Socket} from 'socket.io';
import {serverMessageRouter} from '../messages/messageRouter';
import type {StartTaskRequestMessage } from '../../../src/shared/protocol';
import {updateActiveTasks, startTask, joinTask, getTaskByTile} from "../../../src/store/taskStore";
import {heroes, getHero} from "../../../src/store/heroStore";
import {getTile} from "../../../src/core/world";

export class ServerTaskHandler {
    constructor(private io: Server) {
    }

    init(): void {
        // message handlers only;
        serverMessageRouter.on('task:request_start', this.handleStartRequest.bind(this));
    }

    private handleStartRequest(_socket: Socket, message: StartTaskRequestMessage): void {
        const { heroId, task, location } = message;
        const hero = getHero(heroId);
        if (!hero || !location) return;

        // Only allow if hero is already at the requested tile
        if (hero.q !== location.q || hero.r !== location.r) return;

        const tile = getTile(location);
        if (!tile) return;

        // If a task of this type already exists on this tile, join it; else start it.
        const existing = getTaskByTile(tile.id, task);
        if (!existing) {
            startTask(tile, task, hero);
        } else {
            joinTask(existing.id, hero);
        }

        // Kick task processing
        updateActiveTasks(heroes);
    }
}

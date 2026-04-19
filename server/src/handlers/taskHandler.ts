import type {Server, Socket} from 'socket.io';
import {serverMessageRouter} from '../messages/messageRouter';
import type {StartTaskRequestMessage } from '../../../src/shared/protocol';
import { updateActiveTasks, startTask, joinTask, getTaskByTile } from '../../../src/shared/game/state/taskStore';
import { heroes, getHero } from '../../../src/shared/game/state/heroStore';
import { getTile } from '../../../src/shared/game/world';
import { coopState } from '../state/coopState';
import { isHeroAtTaskAccess } from '../../../src/shared/tasks/taskAccess';

export class ServerTaskHandler {
    constructor(_io: Server) {
    }

    init(): void {
        // message handlers only;
        serverMessageRouter.on('task:request_start', this.handleStartRequest.bind(this));
    }

    private handleStartRequest(_socket: Socket, message: StartTaskRequestMessage): void {
        const { heroId, task, location } = message;
        const hero = getHero(heroId);
        if (!hero || !location) return;
        if (!coopState.canControlHero(_socket.id, heroId)) return;

        coopState.touchHeroActivity(heroId);

        const tile = getTile(location);
        if (!tile) return;

        if (!isHeroAtTaskAccess(hero, task, tile)) return;

        hero.pendingExploreTarget = normalizeExploreTarget(task, message.exploreTarget);

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

function normalizeExploreTarget(task: string, target: { q: number; r: number } | undefined) {
    if (task !== 'explore' || !target) {
        return undefined;
    }

    if (!Number.isFinite(target.q) || !Number.isFinite(target.r)) {
        return undefined;
    }

    return {
        q: Math.trunc(target.q),
        r: Math.trunc(target.r),
    };
}

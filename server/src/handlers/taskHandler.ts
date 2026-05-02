import type {Server, Socket} from 'socket.io';
import {serverMessageRouter} from '../messages/messageRouter';
import type {StartTaskRequestMessage } from '../../../src/shared/protocol';
import { updateActiveTasks, startTask, joinTask, getTaskByTile } from '../../../src/shared/game/state/taskStore';
import { heroes, getHero } from '../../../src/shared/game/state/heroStore';
import { ensureTileExists, getTile } from '../../../src/shared/game/world';
import { coopState } from '../state/coopState';
import { playerSettlementState } from '../state/playerSettlementState';
import { getTileSettlementId } from '../../../src/shared/game/settlement';
import { isTileControlledBySettlement } from '../../../src/shared/game/state/settlementSupportStore';
import { isHeroAtTaskAccess } from '../../../src/shared/tasks/taskAccess';
import { isTaskUnlockedForUse } from '../../../src/shared/tasks/taskUnlocks';
import type { Tile } from '../../../src/core/types/Tile';

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
        const playerId = playerSettlementState.getSocketPlayerId(_socket.id);
        if (!playerSettlementState.canPlayerControlHero(playerId, hero)) return;

        coopState.touchHeroActivity(heroId);

        const tile = getTileForTaskLocation(location, task);
        if (!tile) return;
        if (!canSettlementUseTaskTile(tile, playerSettlementState.getPlayerSettlement(playerId ?? ''))) return;

        if (!isHeroAtTaskAccess(hero, task, tile)) return;
        if (!isTaskUnlockedForUse(task, hero.settlementId ?? playerSettlementState.getPlayerSettlement(playerId ?? ''))) return;

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

function getTileForTaskLocation(location: { q: number; r: number }, task: string) {
    if (!Number.isFinite(location.q) || !Number.isFinite(location.r)) {
        return null;
    }

    if (task === 'explore') {
        return ensureTileExists(Math.trunc(location.q), Math.trunc(location.r));
    }

    return getTile(location);
}

function canSettlementUseTaskTile(
    tile: Tile | null | undefined,
    settlementId: string | null | undefined,
) {
    if (!tile || !settlementId) {
        return false;
    }

    if (tile.discovered && tile.terrain === 'towncenter') {
        return getTileSettlementId(tile) === settlementId;
    }

    if (tile.discovered && tile.ownerSettlementId) {
        return tile.ownerSettlementId === settlementId;
    }

    return isTileControlledBySettlement(tile, settlementId);
}

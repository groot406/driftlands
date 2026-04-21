import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import type { HeroAbilityUseMessage, TileUpdatedMessage } from '../../../src/shared/protocol.ts';
import { getHero } from '../../../src/shared/game/state/heroStore.ts';
import { tileIndex } from '../../../src/shared/game/world.ts';
import { coopState } from '../state/coopState';
import {
    HERO_ABILITY_STABILIZE_MS,
    HERO_ABILITY_TASK_PROGRESS_BURST,
    spendHeroAbilityCharge,
} from '../../../src/shared/heroes/heroAbilities.ts';
import { boostTaskProgress, getTaskById, getTasksAtTile } from '../../../src/shared/game/state/taskStore.ts';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime.ts';
import { revealTileFeatures } from '../../../src/shared/game/tileFeatures.ts';
import { getBuildingDefinitionForTile } from '../../../src/shared/buildings/registry.ts';

export class ServerHeroAbilityHandler {
    constructor(_io: Server) {}

    init(): void {
        serverMessageRouter.on('hero:ability_use', this.handleAbilityUse.bind(this));
    }

    private handleAbilityUse(socket: Socket, message: HeroAbilityUseMessage): void {
        const hero = getHero(message.heroId);
        if (!hero || !coopState.canControlHero(socket.id, hero.id)) {
            return;
        }

        const applied = this.applyAbility(message);
        if (!applied) {
            return;
        }

        spendHeroAbilityCharge(hero);
    }

    private applyAbility(message: HeroAbilityUseMessage) {
        const hero = getHero(message.heroId);
        if (!hero || (hero.abilityCharges ?? 0) <= 0) {
            return false;
        }

        switch (message.ability) {
            case 'boostProduction':
                return this.boostProduction(message.tileId);
            case 'instantTask':
                return this.instantTask(message.taskId, message.tileId);
            case 'stabilizeTile':
                return this.stabilizeTile(message.tileId);
            case 'surveyBoost':
                return this.surveyBoost(message.taskId, message.tileId);
            default:
                return false;
        }
    }

    private boostProduction(tileId: string | undefined) {
        const tile = tileId ? tileIndex[tileId] : null;
        if (!tile || !getBuildingDefinitionForTile(tile)) {
            return false;
        }

        tile.nextProductionBoostMultiplier = Math.max(1.5, tile.nextProductionBoostMultiplier ?? 1);
        broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        return true;
    }

    private instantTask(taskId: string | undefined, tileId: string | undefined) {
        const task = taskId
            ? getTaskById(taskId)
            : (tileId ? getTasksAtTile(tileId)[0] : undefined);

        return !!task && boostTaskProgress(task.id, HERO_ABILITY_TASK_PROGRESS_BURST);
    }

    private stabilizeTile(tileId: string | undefined) {
        const tile = tileId ? tileIndex[tileId] : null;
        if (!tile) {
            return false;
        }

        tile.conditionStabilizedUntilMs = Date.now() + HERO_ABILITY_STABILIZE_MS;
        broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        return true;
    }

    private surveyBoost(taskId: string | undefined, tileId: string | undefined) {
        const task = taskId ? getTaskById(taskId) : undefined;
        if (task?.type === 'surveyTile') {
            return boostTaskProgress(task.id, HERO_ABILITY_TASK_PROGRESS_BURST);
        }

        const tile = tileId ? tileIndex[tileId] : null;
        if (!tile) {
            return false;
        }

        const changed = revealTileFeatures(tile);
        if (changed) {
            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        }
        return changed;
    }
}

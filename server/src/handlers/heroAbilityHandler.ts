import type { Server, Socket } from 'socket.io';
import { serverMessageRouter } from '../messages/messageRouter';
import type { HeroAbilityUseMessage, HeroSkillSelectMessage, TileUpdatedMessage } from '../../../src/shared/protocol.ts';
import { getHero } from '../../../src/shared/game/state/heroStore.ts';
import { tileIndex } from '../../../src/shared/game/world.ts';
import { coopState } from '../state/coopState';
import {
    HERO_ABILITY_STABILIZE_MS,
    HERO_ABILITY_TASK_PROGRESS_BURST,
    broadcastHeroAbilityState,
    refundHeroAbilityCharge,
    spendHeroAbilityCharge,
} from '../../../src/shared/heroes/heroAbilities.ts';
import { boostTaskProgress, getTaskById, getTasksAtTile } from '../../../src/shared/game/state/taskStore.ts';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime.ts';
import { revealTileFeatures } from '../../../src/shared/game/tileFeatures.ts';
import { getBuildingDefinitionForTile } from '../../../src/shared/buildings/registry.ts';
import { getTileSettlementId } from '../../../src/shared/game/settlement';
import {
    getProductionBoostConfig,
    getStabilizeDurationMs,
    getTaskRushBurstAmount,
    isHeroSkillKey,
    selectHeroSkill,
    shouldRefundSurveyWhenNothingFound,
    shouldRefundTaskRushOnCompletion,
    shouldRepairOnStabilize,
    shouldRevealAdjacentOnSurvey,
} from '../../../src/shared/heroes/heroSkills.ts';
import { SIDE_NAMES, type Tile } from '../../../src/core/types/Tile.ts';
import type { Hero } from '../../../src/core/types/Hero.ts';
import { clampBuildingCondition, updateTileCondition } from '../../../src/shared/buildings/maintenance.ts';
import { playerSettlementState } from '../state/playerSettlementState';
import { isTileControlledBySettlement } from '../../../src/shared/game/state/settlementSupportStore.ts';

interface AbilityResult {
    applied: boolean;
    refundCharge?: boolean;
}

export class ServerHeroAbilityHandler {
    constructor(_io: Server) {}

    init(): void {
        serverMessageRouter.on('hero:ability_use', this.handleAbilityUse.bind(this));
        serverMessageRouter.on('hero:skill_select', this.handleSkillSelect.bind(this));
    }

    private handleAbilityUse(socket: Socket, message: HeroAbilityUseMessage): void {
        const hero = getHero(message.heroId);
        if (!hero || !coopState.canControlHero(socket.id, hero.id)) {
            return;
        }
        const playerId = playerSettlementState.getSocketPlayerId(socket.id);
        if (!playerSettlementState.canPlayerControlHero(playerId, hero)) {
            return;
        }

        if (message.tileId && !this.canPlayerUseTile(playerId, message.tileId)) {
            return;
        }

        const result = this.applyAbility(message);
        if (!result.applied) {
            return;
        }

        spendHeroAbilityCharge(hero);
        if (result.refundCharge) {
            refundHeroAbilityCharge(hero);
        }
    }

    private handleSkillSelect(socket: Socket, message: HeroSkillSelectMessage): void {
        const hero = getHero(message.heroId);
        if (!hero || !coopState.canControlHero(socket.id, hero.id) || !isHeroSkillKey(message.skill)) {
            return;
        }
        if (!playerSettlementState.canPlayerControlHero(playerSettlementState.getSocketPlayerId(socket.id), hero)) {
            return;
        }

        if (selectHeroSkill(hero, message.skill)) {
            broadcastHeroAbilityState(hero);
        }
    }

    private applyAbility(message: HeroAbilityUseMessage): AbilityResult {
        const hero = getHero(message.heroId);
        if (!hero || (hero.abilityCharges ?? 0) <= 0) {
            return { applied: false };
        }

        switch (message.ability) {
            case 'boostProduction':
                return this.boostProduction(hero, message.tileId);
            case 'instantTask':
                return this.instantTask(hero, message.taskId, message.tileId);
            case 'stabilizeTile':
                return this.stabilizeTile(hero, message.tileId);
            case 'surveyBoost':
                return this.surveyBoost(hero, message.taskId, message.tileId);
            default:
                return { applied: false };
        }
    }

    private canPlayerUseTile(playerId: string | null | undefined, tileId: string) {
        const tile = tileIndex[tileId] ?? null;
        return canSettlementManageTile(tile, playerSettlementState.getPlayerSettlement(playerId ?? ''));
    }

    private boostProduction(hero: Hero, tileId: string | undefined): AbilityResult {
        const tile = tileId ? tileIndex[tileId] : null;
        if (!tile || !getBuildingDefinitionForTile(tile)) {
            return { applied: false };
        }

        const boost = getProductionBoostConfig(hero);
        tile.nextProductionBoostMultiplier = Math.max(boost.multiplier, tile.nextProductionBoostMultiplier ?? 1);
        tile.nextProductionBoostCyclesRemaining = Math.max(boost.cycles, tile.nextProductionBoostCyclesRemaining ?? 0);
        tile.nextProductionBoostInputReduction = Math.max(boost.inputReduction, tile.nextProductionBoostInputReduction ?? 0);
        broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        return { applied: true };
    }

    private instantTask(hero: Hero, taskId: string | undefined, tileId: string | undefined): AbilityResult {
        const task = taskId
            ? getTaskById(taskId)
            : (tileId ? getTasksAtTile(tileId)[0] : undefined);

        if (!task) {
            return { applied: false };
        }

        const burst = getTaskRushBurstAmount(HERO_ABILITY_TASK_PROGRESS_BURST, hero);
        const willComplete = task.progressXp + burst >= task.requiredXp;
        const applied = boostTaskProgress(task.id, burst);
        return { applied, refundCharge: applied && willComplete && shouldRefundTaskRushOnCompletion(hero) };
    }

    private stabilizeTile(hero: Hero, tileId: string | undefined): AbilityResult {
        const tile = tileId ? tileIndex[tileId] : null;
        if (!tile) {
            return { applied: false };
        }

        const durationMs = getStabilizeDurationMs(HERO_ABILITY_STABILIZE_MS, hero);
        tile.conditionStabilizedUntilMs = Date.now() + durationMs;
        if (shouldRepairOnStabilize(hero)) {
            updateTileCondition(tile, clampBuildingCondition(tile.condition) + 10);
        }
        broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        return { applied: true };
    }

    private surveyBoost(hero: Hero, taskId: string | undefined, tileId: string | undefined): AbilityResult {
        const task = taskId ? getTaskById(taskId) : undefined;
        if (task?.type === 'surveyTile') {
            return { applied: boostTaskProgress(task.id, HERO_ABILITY_TASK_PROGRESS_BURST) };
        }

        const tile = tileId ? tileIndex[tileId] : null;
        if (!tile) {
            return { applied: false };
        }

        let changed = revealTileFeatures(tile);
        if (shouldRevealAdjacentOnSurvey(hero)) {
            changed = this.revealAdjacentActiveFeatures(tile) || changed;
        }
        if (changed) {
            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        }
        const refundWhenEmpty = shouldRefundSurveyWhenNothingFound(hero);
        return { applied: changed || refundWhenEmpty, refundCharge: !changed && refundWhenEmpty };
    }

    private revealAdjacentActiveFeatures(tile: Tile) {
        let changed = false;
        for (const side of SIDE_NAMES) {
            const neighbor = tile.neighbors?.[side];
            if (!neighbor?.discovered || neighbor.activationState === 'inactive') {
                continue;
            }

            if (revealTileFeatures(neighbor)) {
                changed = true;
                broadcast({ type: 'tile:updated', tile: neighbor } as TileUpdatedMessage);
            }
        }
        return changed;
    }
}

function canSettlementManageTile(tile: Tile | null | undefined, settlementId: string | null | undefined) {
    if (!tile || !settlementId) {
        return false;
    }

    if (tile.terrain === 'towncenter') {
        return getTileSettlementId(tile) === settlementId;
    }

    if (tile.ownerSettlementId) {
        return tile.ownerSettlementId === settlementId;
    }

    return isTileControlledBySettlement(tile, settlementId);
}

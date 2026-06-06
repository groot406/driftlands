import type { TickContext } from '../tick';
import { broadcastGameMessage as broadcast, moveHeroWithRuntime } from '../../../src/shared/game/runtime';
import { tileIndex } from '../../../src/shared/game/world';
import { heroes } from '../../../src/shared/game/state/heroStore';
import {
    findNearestActiveTileInSettlement,
    recalculateSettlementSupport,
} from '../../../src/shared/game/state/settlementSupportStore';
import {
    broadcastPopulationState,
    getPopulationBySettlementInput,
    getSettlementHungerInput,
    getPopulationSnapshot,
    recalculatePopulationLimits,
    setSupportMetrics,
} from '../../../src/shared/game/state/populationStore';
import { detachHeroFromCurrentTask, removeTask, taskStore } from '../../../src/shared/game/state/taskStore';
import type { TileUpdatedMessage } from '../../../src/shared/protocol';
import { emitGameplayEvent } from '../../../src/shared/gameplay/events';
import { taskUsesAdjacentActiveAccess } from '../../../src/shared/tasks/taskAccess';
import { axialDistanceCoords } from '../../../src/shared/game/hex';
import { getTileSettlementId } from '../../../src/shared/game/settlement';
import type { Tile } from '../../../src/shared/game/types/Tile';

const SUPPORT_RECALC_INTERVAL_MS = 1_000;
let lastSupportRecalcMs = Number.NEGATIVE_INFINITY;

function snapshotsEqual(a: ReturnType<typeof getPopulationSnapshot>, b: ReturnType<typeof getPopulationSnapshot>) {
    return a.current === b.current
        && a.max === b.max
        && a.beds === b.beds
        && a.hungerMs === b.hungerMs
        && a.supportCapacity === b.supportCapacity
        && a.activeTileCount === b.activeTileCount
        && a.inactiveTileCount === b.inactiveTileCount
        && a.pressureState === b.pressureState
        && JSON.stringify(a.settlements) === JSON.stringify(b.settlements);
}

function rerouteHeroToActiveSettlementTile(heroId: string) {
    const hero = heroes.find((candidate) => candidate.id === heroId);
    if (!hero) return;

    const currentTile = tileIndex[`${hero.q},${hero.r}`] ?? null;
    const pendingTaskTile = hero.pendingTask ? tileIndex[hero.pendingTask.tileId] ?? null : null;
    const settlementId = currentTile?.ownerSettlementId ?? pendingTaskTile?.ownerSettlementId ?? null;
    const fallbackTile = findNearestActiveTileInSettlement(hero.q, hero.r, settlementId);

    detachHeroFromCurrentTask(hero);
    hero.pendingTask = undefined;
    hero.pendingExploreTarget = undefined;

    if (!fallbackTile) {
        hero.movement = undefined;
        return;
    }

    if (hero.q === fallbackTile.q && hero.r === fallbackTile.r) {
        hero.movement = undefined;
        return;
    }

    moveHeroWithRuntime(hero, fallbackTile);
}

function findClosestTownCenterForSettlement(fromQ: number, fromR: number, settlementId: string | null | undefined) {
    if (!settlementId) {
        return null;
    }

    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const tile of Object.values(tileIndex)) {
        if (!tile?.discovered || tile.terrain !== 'towncenter') {
            continue;
        }

        if (getTileSettlementId(tile) !== settlementId) {
            continue;
        }

        const distance = axialDistanceCoords(fromQ, fromR, tile.q, tile.r);
        if (distance < bestDistance || (distance === bestDistance && (!best || tile.id < best.id))) {
            best = tile;
            bestDistance = distance;
        }
    }

    return best;
}

function rerouteHeroToOwnTownCenter(heroId: string) {
    const hero = heroes.find((candidate) => candidate.id === heroId);
    if (!hero) return;

    const townCenter = findClosestTownCenterForSettlement(hero.q, hero.r, hero.settlementId);
    detachHeroFromCurrentTask(hero);
    hero.pendingTask = undefined;
    hero.pendingExploreTarget = undefined;

    if (!townCenter) {
        hero.movement = undefined;
        return;
    }

    if (hero.q === townCenter.q && hero.r === townCenter.r) {
        hero.movement = undefined;
        return;
    }

    moveHeroWithRuntime(hero, townCenter, undefined, undefined, {
        ignoreTerritoryRestrictions: true,
    });
}

function isDisconnectedTile(tileId: string | null | undefined) {
    if (!tileId) {
        return false;
    }

    const tile = tileIndex[tileId] ?? null;
    return !!tile?.discovered && !tile.controlledBySettlementId;
}

function isHeroEscapingDisconnectedTile(heroId: string) {
    const hero = heroes.find((candidate) => candidate.id === heroId);
    if (!hero?.movement?.path.length) {
        return false;
    }

    for (const step of hero.movement.path) {
        if (isDisconnectedTile(`${step.q},${step.r}`)) {
            return false;
        }
    }

    const firstStep = hero.movement.path[0];
    if (!firstStep) {
        return false;
    }

    const firstTile = tileIndex[`${firstStep.q},${firstStep.r}`] ?? null;
    return !!firstTile?.discovered && !!firstTile.controlledBySettlementId;
}

function isEnemyControlledTileForHero(tileId: string | null | undefined, hero: { settlementId?: string | null }) {
    if (!tileId || !hero.settlementId) {
        return false;
    }

    const tile = tileIndex[tileId] ?? null;
    return !!tile?.discovered
        && !!tile.controlledBySettlementId
        && tile.controlledBySettlementId !== hero.settlementId;
}

function isHeroMovingToOwnGround(hero: { movement?: { target: { q: number; r: number } } | undefined; settlementId?: string | null }) {
    if (!hero.movement || !hero.settlementId) {
        return false;
    }

    const targetTile = tileIndex[`${hero.movement.target.q},${hero.movement.target.r}`] ?? null;
    return !!targetTile
        && targetTile.controlledBySettlementId === hero.settlementId;
}

export const supportSystem = {
    name: 'support',
    intervalMs: SUPPORT_RECALC_INTERVAL_MS,
    init: () => {
        lastSupportRecalcMs = Number.NEGATIVE_INFINITY;
    },
    tick: (ctx: TickContext) => {
        if ((ctx.now - lastSupportRecalcMs) < SUPPORT_RECALC_INTERVAL_MS) {
            return;
        }
        lastSupportRecalcMs = ctx.now;

        for (const task of taskStore.tasks.slice()) {
            if (task.type === 'restoreTile') {
                removeTask(task);
            }
        }

        for (const hero of heroes) {
            if (hero.pendingTask?.taskType === 'restoreTile') {
                hero.pendingTask = undefined;
            }

            if (hero.movement?.taskType === 'restoreTile') {
                hero.movement = undefined;
            }
        }

        const previousPopulation = getPopulationSnapshot();
        const result = recalculateSettlementSupport(getPopulationBySettlementInput(), getSettlementHungerInput());

        setSupportMetrics(result.snapshot);
        recalculatePopulationLimits();

        for (const tileId of result.changedTileIds) {
            const tile = tileIndex[tileId];
            if (!tile) continue;
            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        }

        for (const tileId of result.restoredTileIds) {
            const tile = tileIndex[tileId];
            if (!tile) continue;

            emitGameplayEvent({
                type: 'tile:restored',
                tileId: tile.id,
                q: tile.q,
                r: tile.r,
                terrain: tile.terrain,
            });
        }

        const heroIdsToReroute = new Set<string>();
        const heroIdsToReturnHome = new Set<string>();
        for (const hero of heroes) {
            const currentTile = tileIndex[`${hero.q},${hero.r}`] ?? null;
            if (isEnemyControlledTileForHero(currentTile?.id, hero)) {
                if (!isHeroMovingToOwnGround(hero)) {
                    heroIdsToReturnHome.add(hero.id);
                }
                continue;
            }

            if (currentTile?.discovered && !currentTile.controlledBySettlementId) {
                if (isHeroEscapingDisconnectedTile(hero.id)) {
                    continue;
                }
                heroIdsToReroute.add(hero.id);
                continue;
            }

            if (hero.movement?.path.some((step) => {
                return isDisconnectedTile(`${step.q},${step.r}`);
            })) {
                heroIdsToReroute.add(hero.id);
                continue;
            }

            if (!isHeroMovingToOwnGround(hero) && hero.movement?.path.some((step) => {
                return isEnemyControlledTileForHero(`${step.q},${step.r}`, hero);
            })) {
                heroIdsToReturnHome.add(hero.id);
                continue;
            }

            if (hero.pendingTask?.taskType) {
                const pendingTaskTile = tileIndex[hero.pendingTask.tileId] ?? null;
                if (isEnemyControlledTileForHero(pendingTaskTile?.id, hero)) {
                    heroIdsToReturnHome.add(hero.id);
                    continue;
                }

                if (
                    pendingTaskTile?.discovered
                    && !pendingTaskTile.controlledBySettlementId
                    && !taskUsesAdjacentActiveAccess(hero.pendingTask.taskType)
                ) {
                    heroIdsToReroute.add(hero.id);
                }
            }
        }

        for (const heroId of heroIdsToReroute) {
            rerouteHeroToActiveSettlementTile(heroId);
        }

        for (const heroId of heroIdsToReturnHome) {
            rerouteHeroToOwnTownCenter(heroId);
        }

        const nextPopulation = getPopulationSnapshot();
        if (!snapshotsEqual(previousPopulation, nextPopulation)) {
            broadcastPopulationState();
        }
    },
};

import type {TaskCompletedMessage, TaskCreatedMessage, TaskRemovedMessage} from "../../shared/protocol.ts";
import {addTask, doRemoveTask, taskStore} from "../../store/taskStore.ts";
import {clientMessageRouter} from "../messageRouter.ts";
import type {TaskInstance} from "../types/Task.ts";
import { soundService } from '../soundService';
import {tileIndex} from "../world.ts";
import {getHero} from "../../store/heroStore.ts";
import type { HeroStat} from "../types/Hero.ts";
import {getTaskDefinition} from "../../shared/tasks/taskRegistry.ts";
import {playPositionalSound} from "../../store/soundStore.ts";
import {rewardStat, startHeroMovement} from "../heroService.ts";
import {triggerCameraShake} from "../camera.ts";
import {triggerGameplayImpact} from "../gameFeel.ts";
import {addTextIndicator} from "../textIndicators.ts";
import { PathService } from "../PathService.ts";
import { findNearestWarehouseAccessTile, findNearestWarehouseWithCapacity } from "../../shared/buildings/storage.ts";
import type { Hero } from "../types/Hero.ts";

const rewardDeliveryPathService = new PathService();

interface CompletionFeedback {
    text: string;
    color: string;
    soundPath?: string;
    baseVolume?: number;
}

const TASK_COMPLETION_FEEDBACK: Record<string, CompletionFeedback> = {
    explore: { text: 'Discovered', color: '#bfdbfe', soundPath: 'success.mp3', baseVolume: 0.24 },
    activateRuins: { text: 'Study notes', color: '#c4b5fd', soundPath: 'success.mp3', baseVolume: 0.42 },
    surveyTile: { text: 'Surveyed', color: '#bae6fd', soundPath: 'success.mp3', baseVolume: 0.32 },

    plantTrees: { text: 'Saplings planted', color: '#86efac', soundPath: 'success.mp3', baseVolume: 0.34 },
    tillLand: { text: 'Soil ready', color: '#facc15', soundPath: 'drop.mp3', baseVolume: 0.28 },
    irregateDirtTask: { text: 'Watered', color: '#7dd3fc', soundPath: 'splash.mp3', baseVolume: 0.34 },
    seedGrain: { text: 'Field seeded', color: '#fde68a', soundPath: 'success.mp3', baseVolume: 0.32 },
    convertToGrass: { text: 'Grass restored', color: '#86efac', soundPath: 'success.mp3', baseVolume: 0.34 },
    placeWaterLilies: { text: 'Lilies placed', color: '#a7f3d0', soundPath: 'splash.mp3', baseVolume: 0.32 },

    buildRoad: { text: 'Road built', color: '#fef3c7', soundPath: 'drop.mp3', baseVolume: 0.34 },
    buildBridge: { text: 'Bridge built', color: '#bfdbfe', soundPath: 'splash.mp3', baseVolume: 0.36 },
    buildTunnel: { text: 'Tunnel opened', color: '#d1d5db', soundPath: 'mining.mp3', baseVolume: 0.3 },

    campfireRations: { text: 'Rations cooked', color: '#fed7aa', soundPath: 'success.mp3', baseVolume: 0.28 },
    fishAtDock: { text: 'Fresh catch', color: '#bfdbfe', soundPath: 'splash.mp3', baseVolume: 0.28 },
    harvestGrain: { text: 'Grain harvested', color: '#fde68a', soundPath: 'take.mp3', baseVolume: 0.26 },
    harvestWaterLilies: { text: 'Lilies gathered', color: '#a7f3d0', soundPath: 'splash.mp3', baseVolume: 0.24 },
    gatherSand: { text: 'Sand gathered', color: '#fef3c7', soundPath: 'take.mp3', baseVolume: 0.24 },
    clearRocks: { text: 'Rocks cleared', color: '#d1d5db', soundPath: 'mining.mp3', baseVolume: 0.24 },
    breakDirtRock: { text: 'Rock cracked', color: '#d1d5db', soundPath: 'mining.mp3', baseVolume: 0.28 },
    dig: { text: 'Dug out', color: '#d6d3d1', soundPath: 'mining.mp3', baseVolume: 0.24 },
    removeTrunks: { text: 'Cleared', color: '#bbf7d0', soundPath: 'chopping.wav', baseVolume: 0.24 },
};

class ClientTaskHandler {
    private initialized = false;
    private readonly lastWorkImpactMsByTaskId = new Map<string, number>();
    private static readonly WORK_IMPACT_MIN_INTERVAL_MS = 220;

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        clientMessageRouter.on('task:created', this.handleTaskCreated.bind(this));
        clientMessageRouter.on('task:removed', this.handleTaskRemoved.bind(this));
        clientMessageRouter.on('task:progress', this.handleTaskProgress.bind(this));
        clientMessageRouter.on('task:completed', this.handleTaskCompleted.bind(this));
    }

    private handleTaskCreated(message: TaskCreatedMessage): void {
        const tile = tileIndex[message.tileId];
        addTask({
            id: message.taskId,
            type: message.taskType,
            tileId: message.tileId,
            active: true,
            progressXp: 0,
            requiredXp: message.requiredXp,
            createdMs: Date.now(),
            lastUpdateMs: Date.now(),
            participants: message.participantIds.reduce((acc, heroId) => {
                acc[heroId] = 0;
                return acc;
            }, {} as Record<string, number>),
            requiredResources: message.requiredResources,
            collectedResources: [],
        } as TaskInstance);

        for (const heroId of message.participantIds) {
            const hero = getHero(heroId);
            if (hero) {
                hero.currentTaskId = message.taskId;
                if (tile && hero.q === tile.q && hero.r === tile.r) {
                    hero.pendingTask = undefined;
                }
            }
        }
    }

    private handleTaskRemoved(message: TaskRemovedMessage): void {
        const taskToRemove = taskStore.taskIndex[message.taskId];
        this.lastWorkImpactMsByTaskId.delete(message.taskId);
        if (taskToRemove) {
            this.removeSound(taskToRemove);
            doRemoveTask(taskToRemove);
        }
    }

    private removeSound(task: TaskInstance): void {
        const tile = tileIndex[task.tileId];
        if(!tile) {
            return;
        }
        const soundId = `${task.type}-${tile.q}-${tile.r}`;
        soundService.removePositionalSound(soundId);
    }

    private handleTaskProgress(message: any): void {
        const task = taskStore.taskIndex[message.taskId];
        if (task) {
            const previousProgressXp = task.progressXp;
            const previousCollectedTotal = (task.collectedResources || []).reduce((sum, resource) => sum + resource.amount, 0);
            task.progressXp = message.progressXp;
            task.participants = message.participants;
            task.lastUpdateMs = Date.now();
            const tile = tileIndex[task.tileId];

            // Apply resource collection updates and activation flag when present
            if (message.collectedResources) {
                const previousByType = new Map((task.collectedResources || []).map((resource) => [resource.type, resource.amount]));
                task.collectedResources = message.collectedResources;
                const nextCollectedTotal = message.collectedResources.reduce((sum: number, resource: { amount: number }) => sum + resource.amount, 0);
                const deliveredAmount = nextCollectedTotal - previousCollectedTotal;
                if (deliveredAmount > 0 && tile) {
                    const nearbyHeroIds = Object.keys(message.participants)
                        .filter((heroId) => {
                            const hero = getHero(heroId);
                            return !!hero && hero.q === tile.q && hero.r === tile.r;
                        });
                    const impactedHeroIds = nearbyHeroIds.length ? nearbyHeroIds : Object.keys(message.participants).slice(0, 1);

                    for (const collected of message.collectedResources) {
                        const previousAmount = previousByType.get(collected.type) ?? 0;
                        const addedAmount = collected.amount - previousAmount;
                        if (addedAmount <= 0) continue;

                        const indicatorHero = impactedHeroIds
                            .map((heroId) => getHero(heroId))
                            .find((hero): hero is Hero => !!hero);
                        if (indicatorHero) {
                            addTextIndicator(indicatorHero, `+${addedAmount}`, '#fff1a8', 1250);
                        }
                    }

                    triggerCameraShake({
                        q: tile.q,
                        r: tile.r,
                        intensity: Math.min(4.4, 1.4 + (deliveredAmount * 0.45)),
                        durationMs: 120,
                        falloffRadius: 5.5,
                        frequency: 10,
                        directional: true,
                        pushScale: 0.32,
                    });
                }
            }
            if (typeof message.active === 'boolean') {
                task.active = message.active;
            }

            const progressDelta = message.progressXp - previousProgressXp;
            if (progressDelta > 0 && tile && task.type !== 'explore') {
                const nowMs = Date.now();
                const lastWorkImpactMs = this.lastWorkImpactMsByTaskId.get(task.id) ?? 0;
                if ((nowMs - lastWorkImpactMs) >= ClientTaskHandler.WORK_IMPACT_MIN_INTERVAL_MS) {
                    this.lastWorkImpactMsByTaskId.set(task.id, nowMs);

                    const activeHeroIds = Object.keys(message.participants)
                        .filter((heroId) => {
                            const hero = getHero(heroId);
                            return !!hero && hero.q === tile.q && hero.r === tile.r;
                        });
                    triggerGameplayImpact({
                        q: tile.q,
                        r: tile.r,
                        kind: 'work',
                        terrain: tile.terrain,
                        amount: 1,
                        heroIds: activeHeroIds.length ? activeHeroIds : Object.keys(message.participants).slice(0, 1),
                    });
                }
            }

            for (const heroId in message.participants) {
                const hero = getHero(heroId);
                if (hero) {
                    hero.currentTaskId = task.id;
                    if (tile && hero.q === tile.q && hero.r === tile.r) {
                        hero.pendingTask = undefined;
                    }
                }
            }
        }
    }

    private handleTaskCompleted(message: TaskCompletedMessage): void {
        const task = taskStore.taskIndex[message.taskId];
        if (task) {
            const def = getTaskDefinition(task.type);
            const tile = tileIndex[task.tileId];
            this.lastWorkImpactMsByTaskId.delete(task.id);

            if (tile && task.type !== 'explore') {
                triggerGameplayImpact({
                    q: tile.q,
                    r: tile.r,
                    kind: 'complete',
                    terrain: tile.terrain,
                    heroIds: message.rewards.map((reward) => reward.heroId),
                });
                triggerCameraShake({
                    q: tile.q,
                    r: tile.r,
                    intensity: Math.min(7.2, 3.4 + (Object.keys(task.participants).length * 0.75)),
                    durationMs: 190,
                    falloffRadius: 7,
                    frequency: 9.5,
                    directional: true,
                    pushScale: 0.42,
                });
            }

            this.removeSound(task);
            doRemoveTask(task);

            if(!def) {
                return;
            }

            let playedCompletionSound = false;
            // Play completion sound if defined
            if (def.getSoundOnComplete) {
                if(!tile) {
                    return;
                }
                const completionSoundConfig = def.getSoundOnComplete(tile, task);
                if (completionSoundConfig) {

                    const completionSoundId = `${task.type}-complete-${tile.q}-${tile.r}`;
                    playPositionalSound(
                        completionSoundId,
                        completionSoundConfig.soundPath,
                        tile.q,
                        tile.r,
                        {
                            baseVolume: completionSoundConfig.baseVolume,
                            maxDistance: completionSoundConfig.maxDistance,
                            loop: completionSoundConfig.loop
                        }
                    ).catch(error => {
                        console.warn(`Failed to play completion sound for ${task.type}:`, error);
                    });
                    playedCompletionSound = true;
                }
            }

            this.playCompletionFeedback(task, def.label, message.rewards.map((reward) => reward.heroId), playedCompletionSound);
        }

        // Handle rewards for each hero
        for (const reward of message.rewards) {
            const hero = getHero(reward.heroId);
            if (hero) {
                // Update hero stats
                for (const stat in reward.stats) {
                    const heroStat = stat as HeroStat;
                    const rewardAmount = reward.stats[heroStat];

                    if(!rewardAmount) continue;

                    rewardStat(hero, heroStat, rewardAmount);
                }

                if (reward.resources) {
                    hero.carryingPayload = reward.resources;
                    this.startLocalRewardDelivery(hero);
                }

                if (hero.currentTaskId === message.taskId) {
                    hero.currentTaskId = undefined;
                    hero.pendingTask = undefined;
                }
            }
        }
    }

    private playCompletionFeedback(task: TaskInstance, taskLabel: string, heroIds: string[], skipSound: boolean): void {
        const tile = tileIndex[task.tileId];
        if (!tile) {
            return;
        }

        const feedback = this.getCompletionFeedback(task.type, taskLabel);
        if (!feedback) {
            return;
        }

        const indicatorSource = heroIds
            .map((heroId) => getHero(heroId))
            .find((hero): hero is Hero => !!hero)
            ?? tile;

        addTextIndicator(indicatorSource, feedback.text, feedback.color, 1650);

        if (skipSound || !feedback.soundPath) {
            return;
        }

        void playPositionalSound(
            `${task.type}-feedback-${tile.q}-${tile.r}`,
            feedback.soundPath,
            tile.q,
            tile.r,
            {
                baseVolume: feedback.baseVolume ?? 0.3,
                maxDistance: 11,
                loop: false,
            },
        );
    }

    private getCompletionFeedback(taskType: string, taskLabel: string): CompletionFeedback | null {
        const configured = TASK_COMPLETION_FEEDBACK[taskType];
        if (configured) {
            return configured;
        }

        if (taskType.startsWith('build')) {
            return {
                text: taskLabel.replace(/^Build\s+/i, '').replace(/^Found\s+/i, '') + ' built',
                color: '#bbf7d0',
                soundPath: 'success.mp3',
                baseVolume: 0.34,
            };
        }

        if (taskType.startsWith('upgrade')) {
            return {
                text: 'Upgraded',
                color: '#fde68a',
                soundPath: 'success.mp3',
                baseVolume: 0.36,
            };
        }

        return null;
    }

    private startLocalRewardDelivery(hero: Hero): void {
        if (hero.movement || !hero.carryingPayload || hero.carryingPayload.amount <= 0) {
            return;
        }

        // Prefer a warehouse with capacity; fall back to any warehouse for swap
        const warehouse = findNearestWarehouseWithCapacity(hero.q, hero.r, 1)
            ?? findNearestWarehouseAccessTile(hero.q, hero.r);
        if (!warehouse) {
            return;
        }

        const origin = { q: hero.q, r: hero.r };
        const target = { q: warehouse.q, r: warehouse.r };
        const path = rewardDeliveryPathService.findWalkablePath(origin.q, origin.r, target.q, target.r);
        if (!path.length) {
            return;
        }

        startHeroMovement(hero.id, path, target, undefined, {
            origin,
            authoritative: false,
        });
    }
}

export const taskMessageHandler = new ClientTaskHandler();

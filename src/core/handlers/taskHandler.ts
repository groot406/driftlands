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
import { PathService } from "../PathService.ts";
import { findNearestWarehouseAccessTile, findNearestWarehouseWithCapacity } from "../../shared/buildings/storage.ts";
import type { Hero } from "../types/Hero.ts";

const rewardDeliveryPathService = new PathService();

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

                        triggerGameplayImpact({
                            q: tile.q,
                            r: tile.r,
                            kind: 'handin',
                            terrain: tile.terrain,
                            resourceType: collected.type,
                            amount: addedAmount,
                            heroIds: impactedHeroIds,
                        });
                    }

                    triggerCameraShake({
                        q: tile.q,
                        r: tile.r,
                        intensity: Math.min(8.5, 2.8 + (deliveredAmount * 1.1)),
                        durationMs: 150,
                        falloffRadius: 6,
                        frequency: 14,
                        directional: true,
                        pushScale: 0.42,
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
                    intensity: Math.min(12, 5 + (Object.keys(task.participants).length * 1.25)),
                    durationMs: 240,
                    falloffRadius: 8,
                    frequency: 11,
                    directional: true,
                    pushScale: 0.56,
                });
            }

            this.removeSound(task);
            doRemoveTask(task);

            if(!def) {
                return;
            }

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
                }
            }
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

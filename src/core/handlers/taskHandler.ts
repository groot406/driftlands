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
import {rewardStat} from "../heroService.ts";

class ClientTaskHandler {
    init(): void {
        clientMessageRouter.on('task:created', this.handleTaskCreated.bind(this));
        clientMessageRouter.on('task:removed', this.handleTaskRemoved.bind(this));
        clientMessageRouter.on('task:progress', this.handleTaskProgress.bind(this));
        clientMessageRouter.on('task:completed', this.handleTaskCompleted.bind(this));
    }

    private handleTaskCreated(message: TaskCreatedMessage): void {
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

        for (const heroId in message.participantIds) {
            const hero = getHero(heroId);
            if (hero) {
                hero.currentTaskId = message.taskId;
            }
        }
    }

    private handleTaskRemoved(message: TaskRemovedMessage): void {
        const taskToRemove = taskStore.taskIndex[message.taskId];
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
            task.progressXp = message.progressXp;
            task.participants = message.participants;
            task.lastUpdateMs = Date.now();

            // Apply resource collection updates and activation flag when present
            if (message.collectedResources) {
                task.collectedResources = message.collectedResources;
            }
            if (typeof message.active === 'boolean') {
                task.active = message.active;
            }

            for (const heroId in message.participants) {
                const hero = getHero(heroId);
                if (hero) {
                    hero.currentTaskId = task.id;
                }
            }
        }
    }

    private handleTaskCompleted(message: TaskCompletedMessage): void {
        const task = taskStore.taskIndex[message.taskId];
        if (task) {
            const def = getTaskDefinition(task.type);

            this.removeSound(task);
            doRemoveTask(task);

            if(!def) {
                return;
            }

            // Play completion sound if defined
            if (def.getSoundOnComplete) {
                const tile = tileIndex[task.tileId];
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
                }

                if (hero.currentTaskId === message.taskId) {
                    hero.currentTaskId = undefined;
                }
            }
        }
    }
}

export const taskMessageHandler = new ClientTaskHandler();

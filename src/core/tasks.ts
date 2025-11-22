import type {Tile} from './world';
import type {Hero, HeroStat} from '../store/heroStore';
import {startTask, joinTask, getTaskByTile, getSelectedTaskForTile} from '../store/taskStore';

// Import task definitions to register them
import '../core/taskDefs/explore';

// Task definition interfaces enable future extension.
export interface TaskDefinition {
    key: TaskType;
    label: string;

    // Total XP required for completion (can depend on tile distance)
    requiredXp(distance: number): number;

    // XP contribution per tick for a given hero (can depend on hero & tile)
    heroRate(hero: Hero, tile: Tile): number;

    // Optional hook when task starts
    onStart?(tile: Tile, participants: Hero[]): void;

    // Optional hook each tick after progress applied
    onProgress?(tile: Tile, instance: TaskInstance): void;

    // Completion hook (e.g. discover tile, distribute rewards)
    onComplete(tile: Tile, instance: TaskInstance, participants: Hero[]): void;

    // Optional base reward XP for participants collectively (split proportionally)
    totalRewardedStats?: Map<HeroStat, number>;
}

export type TaskType = 'explore' | string;

export interface TaskInstance {
    id: string;
    type: TaskType;
    tileId: string;
    progressXp: number;
    requiredXp: number;
    createdTick: number;
    completedTick?: number;
    participants: Record<string, number>; // heroId -> contributedXp
    active: boolean;
}

// Removed local registry & explore task definition; see taskRegistry.ts and taskDefs/explore.ts

// Helper invoked when hero arrives at a tile (from heroStore)
export function handleHeroArrival(hero: Hero, tile: Tile) {
    if (!hero || !tile || !hero.movement?.taskType) return;

    const selected = getSelectedTaskForTile(tile.id, hero.movement.taskType);
    if (selected) {
        const existing = getTaskByTile(tile.id, selected);
        if (!existing) {
            startTask(tile, selected, hero);
        } else if (existing.active && !existing.completedTick) {
            joinTask(existing.id, hero);
        }
    }
}
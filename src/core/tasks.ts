import type {Tile} from './world';
import type {Hero, HeroStat} from '../store/heroStore';
import {startTask, joinTask, getTaskByTile} from '../store/taskStore';
import { HexMapService } from './HexMapService';
import { depositResource } from '../store/resourceStore';

// Import task definitions to register them
import '../core/taskDefs/explore';
import '../core/taskDefs/chopWood'; // register chop wood task
import '../core/taskDefs/plantTrees'; // register plant trees task
import '../core/taskDefs/removeTrunks'; // register remove trunks task

import {startHeroMovement} from '../store/heroStore';
import {listTaskDefinitions} from "./taskRegistry.ts";
// Task definition interfaces enable future extension.
export interface TaskDefinition {
    key: TaskType;
    label: string;

    // Whether a hero can start this task on the given tile
    canStart(tile: Tile, hero: Hero): boolean;

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
    totalRewardedStats(distance: number): Record<HeroStat, number>;

    chainAdjacentSameTerrain?: boolean; // new optional flag to auto-chain task to neighboring same-terrain tiles
}

export type TaskType = 'explore' | 'chopWood' | 'plantTrees' | string;

export interface TaskInstance {
    id: string;
    type: TaskType;
    tileId: string;
    progressXp: number;
    requiredXp: number;
    createdTick: number; // legacy tick when created
    completedTick?: number; // legacy tick when completed
    // Real-time fields for offline progression
    createdMs: number; // Date.now() when task started
    lastUpdateMs: number; // last Date.now() when progress applied
    completedMs?: number; // Date.now() when completed
    participants: Record<string, number>; // heroId -> contributedXp (time-scaled cumulative)
    active: boolean;
}

// Removed local registry & explore task definition; see taskRegistry.ts and taskDefs/explore.ts

// Helper invoked when hero arrives at a tile (from heroStore)
export function handleHeroArrival(hero: Hero, tile: Tile) {
    if (!hero || !tile) return;
    // Resource deposit: if hero carrying a payload and tile is towncenter, deposit and send hero back
    if (hero.carryingPayload && tile.terrain === 'towncenter') {
        depositResource(hero.carryingPayload.type as any, hero.carryingPayload.amount);
        hero.carryingPayload = undefined;
        hero.carryingResources = false; // legacy flag
        const dest = hero.returnPos;
        if (dest) {
            const service = new HexMapService();
            const path = service.findWalkablePath(hero.q, hero.r, dest.q, dest.r);
            if (path.length) {
                startHeroMovement(hero.id, path, { q: dest.q, r: dest.r });
                return; // defer task start until after return
            }
        }
        hero.returnPos = undefined;
    }
    // Legacy wood delivery (fallback if payload not used yet)
    else if (hero.carryingResources && tile.terrain === 'towncenter') {
        hero.carryingResources = false;
        const dest = hero.returnPos;
        if (dest) {
            const service = new HexMapService();
            const path = service.findWalkablePath(hero.q, hero.r, dest.q, dest.r);
            if (path.length) {
                startHeroMovement(hero.id, path, { q: dest.q, r: dest.r });
                return; // defer task start until after return
            }
        }
        hero.returnPos = undefined;
    }
    if (!hero.movement?.taskType) {
        // If hero ended a return movement (no taskType) and reached returnPos, clear returnPos
        if (hero.returnPos && hero.q === hero.returnPos.q && hero.r === hero.returnPos.r) {
            hero.returnPos = undefined;
        }
        return;
    }
    const selected = hero.movement?.taskType;
    if (selected) {
        const existing = getTaskByTile(tile.id, selected);
        if (!existing) {
            startTask(tile, selected, hero);
        } else if (existing.active && !existing.completedTick) {
            joinTask(existing.id, hero);
        }
    }
}

export function getAvailableTasks(tile: Tile, hero: Hero): TaskDefinition[] {
    // Loop through registered tasks from taskRegistry and check canStart
    return listTaskDefinitions().filter((taskDefinition) => taskDefinition.canStart(tile, hero));
}
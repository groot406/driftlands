import type {Hero, HeroStat} from "./Hero.ts";
import type {Tile} from "./Tile.ts";
import type {ResourceAmount} from "./Resource.ts";

export interface TaskDefinition {
    key: TaskType;
    label: string;
    allowInactiveTile?: boolean;

    // Whether a hero can start this task on the given tile
    canStart(tile: Tile, hero: Hero): boolean;

    // Total XP required for completion (can depend on tile distance)
    requiredXp(distance: number): number;

    // XP contribution per tick for a given hero (can depend on hero & tile)
    heroRate(hero: Hero, tile: Tile): number;

    // Optional hook when task starts
    onStart?(tile: Tile, instance: TaskInstance, participants: Hero[]): void;

    // Optional hook each tick after progress applied
    onProgress?(tile: Tile, instance: TaskInstance): void;

    // Completion hook (e.g. discover tile, distribute rewards)
    onComplete?(tile: Tile, instance: TaskInstance, participants: Hero[]): void;

    // Optional base reward XP for participants collectively (split proportionally)
    totalRewardedStats?(distance: number): Record<HeroStat, number>;

    // Optional base reward resources for participants collectively (split proportionally)
    totalRewardedResources?(distance: number, tile ?: Tile): ResourceAmount;

    requiredResources?(distance: number): ResourceAmount[]
    canAutoChainTo?(sourceTile: Tile, targetTile: Tile, hero: Hero): boolean;

    repeatTask?: boolean; // whether task can be repeated on same tile
    chainAdjacentSameTerrain?: boolean|Function; // optional flag to auto-chain task to neighboring same-terrain tiles

    // Sound configuration methods - return sound config or null if no sound
    getSoundOnStart?(tile: Tile, participants: Hero[]): TaskSoundConfig | null;
    getSoundOnComplete?(tile: Tile, instance: TaskInstance): TaskSoundConfig | null;
}
export type TaskType = 'explore' | 'chopWood' | 'plantTrees' | string;

// Sound configuration for tasks
export interface TaskSoundConfig {
    soundPath: string;
    baseVolume: number;
    maxDistance: number;
    loop: boolean;
}

export interface TaskInstance {
    id: string;
    type: TaskType;
    tileId: string;
    progressXp: number;
    requiredXp: number;
    // Real-time fields for offline progression
    createdMs: number; // Date.now() when task started
    lastUpdateMs: number; // last Date.now() when progress applied
    completedMs?: number; // Date.now() when completed
    participants: Record<string, number>; // heroId -> contributedXp (time-scaled cumulative)
    active: boolean;
    // Resource tracking for tasks that require resources
    requiredResources?: ResourceAmount[]; // Resources needed to start/continue task
    collectedResources?: ResourceAmount[]; // resourceType -> amount collected so far
    // Task-specific context to store metadata (e.g., approach side for docks)
    context?: Record<string, any>;
}

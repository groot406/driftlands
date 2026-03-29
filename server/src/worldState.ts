import { generateInitialWorld, tiles } from '../../src/shared/game/world';
import { heroes } from "../../src/shared/game/state/heroStore";
import { taskStore } from "../../src/shared/game/state/taskStore";
import { listStorageSnapshots, resetResourceState, resourceInventory } from "../../src/shared/game/state/resourceStore";
import type { Tile } from "../../src/shared/game/types/Tile";
import type { Hero } from "../../src/shared/game/types/Hero";
import type { TaskInstance } from "../../src/shared/game/types/Task";
import type { ResourceType } from "../../src/shared/game/types/Resource";
import type { StorageSnapshot } from '../../src/shared/game/storage';
import { runState } from "./state/runState";
import { frontierFindState } from "./state/frontierFindState";
import { setStoryProgressionForMission } from '../../src/shared/story/progressionState';

function serializeTile(tile: Tile): Tile {
  return {
    id: tile.id,
    q: tile.q,
    r: tile.r,
    biome: tile.biome,
    terrain: tile.terrain,
    discovered: tile.discovered,
    variant: tile.variant ?? null,
    variantSetMs: tile.variantSetMs,
    variantAgeMs: tile.variantAgeMs,
    fencedEdges: tile.fencedEdges ? { ...tile.fencedEdges } : undefined,
  };
}

function serializeHero(hero: Hero): Hero {
  return {
    id: hero.id,
    name: hero.name,
    avatar: hero.avatar,
    q: hero.q,
    r: hero.r,
    stats: { ...hero.stats },
    facing: hero.facing,
    movement: hero.movement
      ? {
          path: hero.movement.path.map((step) => ({ ...step })),
          origin: { ...hero.movement.origin },
          target: { ...hero.movement.target },
          startMs: hero.movement.startMs,
          stepDurations: hero.movement.stepDurations.slice(),
          cumulative: hero.movement.cumulative.slice(),
          taskType: hero.movement.taskType,
          requestId: hero.movement.requestId,
          authoritative: hero.movement.authoritative,
        }
      : undefined,
    currentTaskId: hero.currentTaskId,
    pendingTask: hero.pendingTask ? { ...hero.pendingTask } : undefined,
    carryingPayload: hero.carryingPayload ? { ...hero.carryingPayload } : undefined,
    pendingChain: hero.pendingChain ? { ...hero.pendingChain } : undefined,
    returnPos: hero.returnPos ? { ...hero.returnPos } : undefined,
  };
}

function serializeTask(task: TaskInstance): TaskInstance {
  return {
    id: task.id,
    type: task.type,
    tileId: task.tileId,
    progressXp: task.progressXp,
    requiredXp: task.requiredXp,
    createdMs: task.createdMs,
    lastUpdateMs: task.lastUpdateMs,
    completedMs: task.completedMs,
    participants: { ...task.participants },
    active: task.active,
    requiredResources: task.requiredResources?.map((resource) => ({ ...resource })),
    collectedResources: task.collectedResources?.map((resource) => ({ ...resource })),
    context: task.context ? { ...task.context } : undefined,
  };
}

// Simple in-memory world state. For now, generate a minimal world.
// This can later be replaced with a richer generator and persistence layer.
class WorldState {
  init(): Promise<void> {
    frontierFindState.reset();
    resetResourceState();
    setStoryProgressionForMission(1);
    generateInitialWorld(1);
    runState.initialize(Number(process.env.SERVER_SEED ?? 123456789));
    return Promise.resolve();
  }

  getSnapshot(): { tiles: Tile[], heroes: Hero[], tasks: TaskInstance[], resources: Partial<Record<ResourceType, number>>, storages: StorageSnapshot[] } {
    const resources: Partial<Record<ResourceType, number>> = {};
    for (const [k, v] of Object.entries(resourceInventory)) {
      (resources as any)[k] = v as number;
    }

    const storages = listStorageSnapshots();

    return {
      tiles: tiles.map(serializeTile),
      heroes: heroes.map(serializeHero),
      tasks: taskStore.tasks.map(serializeTask),
      resources,
      storages,
    };
  }
}

export const worldState = new WorldState();

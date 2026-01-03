import {generateInitialWorld, tiles} from '../../src/core/world';
import {heroes} from "../../src/store/heroStore";
import {taskStore} from "../../src/store/taskStore";
import {resourceInventory} from "../../src/store/resourceStore";

import {Tile} from "../../src/core/types/Tile";
import {Hero} from "../../src/core/types/Hero";
import {TaskInstance} from "../../src/core/types/Task";
import type {ResourceType} from "../../src/core/types/Resource";

// Simple in-memory world state. For now, generate a minimal world.
// This can later be replaced with a richer generator and persistence layer.
class WorldState {
  init(): Promise<void> {
    return generateInitialWorld(1)
  }

  getSnapshot(): { tiles: Tile[], heroes: Hero[], tasks: TaskInstance[], resources: Partial<Record<ResourceType, number>> } {
    // Build a plain object to avoid sending Vue reactive proxies over the wire
    const resources: Partial<Record<ResourceType, number>> = {};
    for (const [k, v] of Object.entries(resourceInventory)) {
      (resources as any)[k] = v as number;
    }
    return { tiles, heroes, tasks: taskStore.tasks, resources };
  }
}

export const worldState = new WorldState();
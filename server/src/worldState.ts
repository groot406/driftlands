import {generateInitialWorld, tiles} from '../../src/core/world';
import {heroes} from "../../src/store/heroStore";
import {taskStore} from "../../src/store/taskStore";

import {Tile} from "../../src/core/types/Tile";
import {Hero} from "../../src/core/types/Hero";
import {TaskInstance} from "../../src/core/types/Task";

// Simple in-memory world state. For now, generate a minimal world.
// This can later be replaced with a richer generator and persistence layer.
class WorldState {
  init(): Promise<void> {
    return generateInitialWorld(1)
  }

  getSnapshot(): { tiles: Tile[], heroes: Hero[], tasks: TaskInstance[] } {
    return { tiles, heroes, tasks: taskStore.tasks };
  }
}

export const worldState = new WorldState();
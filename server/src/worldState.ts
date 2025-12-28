import {generateInitialWorld, Tile, tiles} from '../../src/core/world';

// Simple in-memory world state. For now, generate a minimal world.
// This can later be replaced with a richer generator and persistence layer.
class WorldState {
  init(): Promise<void> {
    return generateInitialWorld(1)
  }

  getSnapshot(): { tiles: Tile[] } {
    return { tiles: tiles };
  }
}

export const worldState = new WorldState();
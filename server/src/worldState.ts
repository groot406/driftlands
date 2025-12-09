import type { Tile } from '../../src/core/world';

// Simple in-memory world state. For now, generate a minimal world with a towncenter.
// This can later be replaced with a richer generator and persistence layer.
class WorldState {
  private tiles: Tile[] = [];

  init(): void {
    this.tiles = [{
      id: '0,0',
      q: 0,
      r: 0,
      biome: null,
      terrain: 'towncenter',
      discovered: true,
      variant: null
    }];
  }

  getSnapshot(): { tiles: Tile[] } {
    return { tiles: this.tiles };
  }
}

export const worldState = new WorldState();


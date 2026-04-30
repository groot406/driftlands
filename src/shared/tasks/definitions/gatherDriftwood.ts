import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { Hero } from '../../../core/types/Hero.ts';
import type { Tile } from '../../../core/types/Tile.ts';
import { countActiveAdjacentTiles } from '../../game/state/settlementSupportStore.ts';

const gatherDriftwoodTask: TaskDefinition = {
    key: 'gatherDriftwood',
    label: 'Gather Driftwood',
    allowInactiveTile: true,
    chainAdjacentSameTerrain: false,

    canStart(tile: Tile, _hero: Hero) {
        // Only on plains adjacent to water
        return tile.terrain === 'plains' && countActiveAdjacentTiles(tile, 'water') > 0;
    },

    requiredXp(_distance: number) {
        return 800;
    },

    heroRate(hero: Hero) {
        return 12 * Math.max(1, hero.stats.atk);
    },

    totalRewardedResources(_distance: number) {
        return { type: 'wood', amount: 1 };
    },

    getSoundOnStart() {
        return {
            soundPath: 'chopping.wav', // Fallback to chopping sound or something similar
            baseVolume: 0.3,
            maxDistance: 10,
            loop: false,
        };
    },
};

registerTask(gatherDriftwoodTask);

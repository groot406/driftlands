import { registerTask } from '../taskRegistry';
import type { ResourceAmount, TaskDefinition } from '../tasks';
import type { Hero } from '../../store/heroStore';

const seedGrainTask: TaskDefinition = {
    key: 'seedGrain',
    label: 'Plant Seeds',
    chainAdjacentSameTerrain: true,

    canStart(tile, hero) {
        return !hero.carryingPayload &&
               tile.terrain === 'dirt' &&
               (tile.variant === 'dirt_tilled_hydrated' || tile.variant === 'dirt_tilled');
    },

    requiredXp(distance: number) {
        return 1000 * distance;
    },

    requiredResources(): ResourceAmount[] {
        return [
            { type: 'grain', amount: 1 },
            { type: 'water', amount: 1 }
        ];
    },

    heroRate(hero: Hero) {
        // Seeding is less intensive than other farming tasks
        return 20 * hero.stats.atk;
    },

    onComplete(tile, _instance) {
        // Transform tilled dirt to grain field
        if (tile.terrain === 'dirt' && (tile.variant === 'dirt_tilled_hydrated' || tile.variant === 'dirt_tilled')) {
            tile.terrain = 'grain';
            tile.variant = null;
            // Set timestamp for potential future growth mechanics
            tile.variantSetMs = Date.now();
        }
    }
};

registerTask(seedGrainTask);

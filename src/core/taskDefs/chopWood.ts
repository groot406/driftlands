import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../tasks';
import type { Hero } from '../../store/heroStore';
import { applyVariant } from '../variants';

const chopWoodTask: TaskDefinition = {
    key: 'chopWood',
    label: 'Chop Wood',
    chainAdjacentSameTerrain: true,

    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'forest' && (!tile.variant || tile.variant === '');
    },

    requiredXp(_distance: number) {
        // Fixed effort per forest tile for now
        return 2000 * _distance;
    },

    heroRate(hero: Hero) {
        // Use attack stat for chopping efficiency; add small base
        return 10 * hero.stats.atk * 2;
    },

    totalRewardedResources(_distance: number) {
        return { type: 'wood', amount: 4 *_distance };
    },

    getSoundOnStart(tile, participants) {
        // Return sound configuration for chopping
        return {
            soundPath: '/src/assets/sounds/chopping.wav',
            baseVolume: 0.6,
            maxDistance: 15,
            loop: true
        };
    },

    onComplete(tile, _instance, _participants) {

        // Replace forest with chopped_forest (only if still forest)
        if (tile.terrain === 'forest') {
            applyVariant(tile, 'chopped_forest', { stagger: false, respectBiome: true });
        }
    }
};

registerTask(chopWoodTask);

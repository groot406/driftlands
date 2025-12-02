import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../tasks';
import type { Hero } from '../../store/heroStore';
import { applyVariant } from '../variants';
import { playPositionalSound, removePositionalSound } from '../../store/soundStore';

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

    onStart(tile, _participants) {
        // Play chopping sound when task starts
        const soundId = `chopWood-${tile.q}-${tile.r}`;
        playPositionalSound(
            soundId,
            '/src/assets/sounds/chopping.wav',
            tile.q,
            tile.r,
            {
                baseVolume: 0.6,
                maxDistance: 15,
                loop: true
            }
        );
    },

    onComplete(tile, _instance, _participants) {
        // Stop chopping sound when task completes
        const soundId = `chopWood-${tile.q}-${tile.r}`;
        removePositionalSound(soundId);

        // Replace forest with chopped_forest (only if still forest)
        if (tile.terrain === 'forest') {
            applyVariant(tile, 'chopped_forest', { stagger: false, respectBiome: true });
        }
    }
};

registerTask(chopWoodTask);

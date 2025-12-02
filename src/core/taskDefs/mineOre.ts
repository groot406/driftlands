import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from '../tasks';
import type { Hero } from '../../store/heroStore';
import { playPositionalSound, removePositionalSound } from '../../store/soundStore';

const mineOreTask: TaskDefinition = {
    key: 'mineOre',
    label: 'Mine Ore',
    chainAdjacentSameTerrain: true,
    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'mountain' && tile.variant === 'mountains_with_mine';
    },

    requiredXp(_distance: number) {
        return 5000 * _distance;
    },
    heroRate(hero: Hero) {
        return 10 * hero.stats.atk * 2;
    },

    totalRewardedResources(_distance: number) {
        return { type: 'ore', amount: 4 *_distance };
    },

    onStart(tile, _participants) {
        // Play mining sound when task starts
        const soundId = `mineOre-${tile.q}-${tile.r}`;
        playPositionalSound(
            soundId,
            '/src/assets/sounds/mining.mp3',
            tile.q,
            tile.r,
            {
                baseVolume: 0.8,
                maxDistance: 12,
                loop: true
            }
        );
    },

    onComplete(tile, _instance, _participants) {
        // Stop mining sound when task completes
        const soundId = `mineOre-${tile.q}-${tile.r}`;
        removePositionalSound(soundId);
    }

};

registerTask(mineOreTask);

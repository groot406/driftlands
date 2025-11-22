import type {Hero} from '../../store/heroStore';
import {discoverTile} from '../world';
import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from '../tasks';

// Explore task definition separated for modularity.
const exploreTask: TaskDefinition = {
    key: 'explore',
    label: 'Explore',
    requiredXp(distance: number) {
        return 12 + Math.floor(distance * 1.5); // tuning constant
    },
    heroRate(hero: Hero) {
        return Math.max(1, hero.stats.xp);
    },
    totalRewardedStats: {xp: 100},
    onStart(tile, participants) {
    },
    onComplete(tile, instance, participants) {
        discoverTile(tile);
    }
};

registerTask(exploreTask);



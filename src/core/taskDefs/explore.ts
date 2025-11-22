import type {Hero} from '../../store/heroStore';
import {discoverTile} from '../world';
import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from '../tasks';

// Explore task definition separated for modularity.
const exploreTask: TaskDefinition = {
    key: 'explore',
    label: 'Explore',
    requiredXp(distance: number) {
        return 100 * Math.floor((distance+1) * ((distance+1)/2)); // tuning constant
    },
    heroRate(hero: Hero) {
        return Math.max(1, hero.stats.xp);
    },
    totalRewardedStats(distance) {
        return {xp: Math.ceil(distance/2) }
    },
    onStart(tile, participants) {
    },
    onComplete(tile, instance, participants) {
        discoverTile(tile);
    }
};

registerTask(exploreTask);



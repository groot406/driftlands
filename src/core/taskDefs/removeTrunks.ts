import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from '../tasks';
import type {Hero} from '../../store/heroStore';
import { worldVersion } from '../world';
import { terrainPositions } from '../terrainRegistry';

// Task: Restore chopped_forest back plain.
// Heroes collectively spend time replanting; progress rate uses hero XP & ATK lightly.
const removeTrunksTask: TaskDefinition = {
    key: 'removeTrunks',
    label: 'Remove Trunks',

    canStart(tile, hero) {
        return !hero.carryingPayload && hero.carryingResources === false && tile.terrain === 'forest' && tile.variant === 'chopped_forest';
    },

    requiredXp(_distance: number) {
        // Flat effort for now; slightly higher than chop to slow regrowth pacing.
        return 1000 * _distance;
    },
    heroRate(hero: Hero) {
        // Use a mix of base + scaled by hero XP & ATK so experienced heroes replant faster.
        return 5 + hero.stats.xp * 2 + hero.stats.atk;
    },
    totalRewardedStats(_distance: number) {
        // Modest XP reward for ecological effort.
        return {xp: 5, hp: 0, atk: 5, spd: 0};
    },
    onStart(tile, _participants) {
        // Guard: If tile changed before start, abort implicitly by leaving logic minimal.
        if (tile.variant !== 'chopped_forest') return;
    },
    onComplete(tile, _instance, _participants) {
        // Only convert if still chopped_forest (another task might have altered it).
        if (tile.variant === 'chopped_forest') {
            tile.terrain = 'plains';
            tile.variant = undefined;
            tile.variantSetMs = undefined;

            terrainPositions.forest.delete(tile.id);
            terrainPositions.plains.add(tile.id);
            worldVersion.value++;
        }
    }
};

registerTask(removeTrunksTask);

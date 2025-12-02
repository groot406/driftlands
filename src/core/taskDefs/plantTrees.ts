import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from '../tasks';
import type {Hero} from '../../store/heroStore';
import { worldVersion } from '../world';
import { terrainPositions } from '../terrainRegistry';
import { applyVariant } from '../variants';

// Task: Restore chopped_forest back into forest.
// Heroes collectively spend time replanting; progress rate uses hero XP & ATK lightly.
const plantTreesTask: TaskDefinition = {
    key: 'plantTrees',
    label: 'Plant Trees',
    chainAdjacentSameTerrain: true,
    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'forest' && tile.variant === 'chopped_forest';
    },

    requiredXp(_distance: number) {
        // Flat effort for now; slightly higher than chop to slow regrowth pacing.
        return 3000 * _distance;
    },
    heroRate(hero: Hero) {
        // Use a mix of base + scaled by hero XP & ATK so experienced heroes replant faster.
        return 5 + hero.stats.xp * 2 + hero.stats.atk;
    },
    totalRewardedStats(_distance: number) {
        // Modest XP reward for ecological effort.
        return {xp: 4 * _distance, hp: 0, atk: 0, spd: 0};
    },
    onStart(tile, _participants) {
        // Guard: If tile changed before start, abort implicitly by leaving logic minimal.
        if (tile.variant !== 'chopped_forest') return;
        // No special per-hero flags needed.
    },
    onComplete(tile, _instance, _participants) {
        // Only convert if still chopped_forest (another task might have altered it).
        if (tile.variant === 'chopped_forest') {
            applyVariant(tile, 'young_forest', { stagger: false, respectBiome: true });
            terrainPositions.forest.add(tile.id);
            worldVersion.value++;
        }
    }
};

registerTask(plantTreesTask);

import {registerTask} from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import { terrainPositions } from '../../../core/terrainRegistry';
import { applyVariant } from '../../../core/variants';
import type {Hero} from "../../../core/types/Hero";

// Task: restore chopped forest or plant new saplings on open plains.
// Heroes collectively spend time replanting; progress rate uses ATK only.
const plantTreesTask: TaskDefinition = {
    key: 'plantTrees',
    label: 'Plant Trees',
    chainAdjacentSameTerrain: true,
    canStart(tile, _hero) {
        return (tile.terrain === 'forest' && tile.variant === 'chopped_forest') || (tile.terrain === 'plains' && tile.isBaseTile);
    },

    requiredXp(_distance: number) {
        return 1200;
    },
    heroRate(hero: Hero) {
        return 16 + hero.stats.atk * 8;
    },
    totalRewardedStats(_distance: number) {
        return {xp: 10, hp: 0, atk: 0, spd: 0};
    },
    onStart(tile) {
        // Guard: If tile changed before start, abort implicitly by leaving logic minimal.
        if (tile.variant !== 'chopped_forest') return;
        // No special per-hero flags needed.
    },
    onComplete(tile, _instance, _participants) {
        if (tile.terrain === 'plains' && tile.isBaseTile) {
            terrainPositions.plains.delete(tile.id);
            terrainPositions.forest.add(tile.id);
            tile.terrain = 'forest';
            applyVariant(tile, 'young_forest', { stagger: false, respectBiome: true });
            return;
        }

        // Only convert if still chopped_forest (another task might have altered it).
        if (tile.terrain === 'forest' && tile.variant === 'chopped_forest') {
            applyVariant(tile, 'young_forest', { stagger: false, respectBiome: true });
            terrainPositions.forest.add(tile.id);
        }
    }
};

registerTask(plantTreesTask);

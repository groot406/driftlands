import { registerTask } from '../taskRegistry';
import type {ResourceAmount, TaskDefinition} from '../tasks';
import type { Hero } from '../../store/heroStore';
import {applyVariant} from "../variants.ts";

const buildMineTask: TaskDefinition = {
    key: 'buildMine',
    label: 'Build mine',
    chainAdjacentSameTerrain: false,
    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'mountain' && !tile.variant;
    },

    requiredXp(_distance: number) {
        return 5000 * _distance;
    },
    heroRate(hero: Hero) {
        return 10 * hero.stats.atk * 2;
    },

    requiredResources(distance: number): ResourceAmount[] {
        return [{ type: 'wood', amount: 10 * distance }];
    },

    onComplete(tile, _instance) {
        if (tile.terrain === 'mountain') {
            applyVariant(tile, 'mountains_with_mine', { stagger: false, respectBiome: true });
        }
    }
};

registerTask(buildMineTask);

import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import type {Hero} from "../../../core/types/Hero";
import type {ResourceAmount} from "../../../core/types/Resource.ts";
import {applyVariant} from "../../../core/variants.ts";

const seedGrainTask: TaskDefinition = {
    key: 'seedGrain',
    label: 'Plant Seeds',
    chainAdjacentSameTerrain: true,

    canStart(tile, _hero) {
        return tile.terrain === 'dirt' &&
               (tile.variant === 'dirt_tilled_hydrated' || tile.variant === 'dirt_tilled');
    },

    requiredXp(_distance: number) {
        return 1000;
    },

    requiredResources(): ResourceAmount[] {
        return [
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
            applyVariant(tile, 'grain_planted', { stagger: false, respectBiome: false });
        }
    }
};

registerTask(seedGrainTask);

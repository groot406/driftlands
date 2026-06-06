import { registerTask } from '../taskRegistry';
import type { Hero } from '../../../core/types/Hero';
import type { ResourceAmount } from '../../../core/types/Resource';
import type { TaskDefinition } from '../../../core/types/Task';
import type { Tile } from '../../../core/types/Tile';
import {
    MAX_BUILDING_CONDITION,
    getRepairNeededAmount,
    getTileRepairResources,
    isMaintainedBuildingTile,
    updateTileCondition,
} from '../../buildings/maintenance.ts';

const repairBuildingTask: TaskDefinition = {
    key: 'repairBuilding',
    label: 'Repair Building',
    allowInactiveTile: true,
    chainAdjacentSameTerrain: false,

    canStart(tile: Tile) {
        return tile.discovered
            && isMaintainedBuildingTile(tile)
            && getRepairNeededAmount(tile) > 0;
    },

    requiredXp(_distance: number) {
        return 900;
    },

    heroRate(hero: Hero) {
        return 18 * Math.max(1, hero.stats.atk);
    },

    requiredResources(_distance: number, tile?: Tile): ResourceAmount[] {
        return getTileRepairResources(tile);
    },

    onComplete(tile: Tile) {
        updateTileCondition(tile, MAX_BUILDING_CONDITION);
    },
};

registerTask(repairBuildingTask);

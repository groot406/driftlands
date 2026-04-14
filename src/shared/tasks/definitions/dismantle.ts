import { registerTask } from '../taskRegistry';
import { applyVariant } from '../../../core/variants';
import type { Hero } from '../../../core/types/Hero';
import type { TaskDefinition } from '../../../core/types/Task';
import type { Tile } from '../../../core/types/Tile';
import { onBuildingCompleted as onPopulationBuildingCompleted } from '../../../store/populationStore';
import { getBuildingDefinitionForTile } from '../../buildings/registry';
import { isBridgeTile } from '../../game/bridges.ts';
import { isRoadTile } from '../../game/roads.ts';

function isDismantlableConstruction(tile: Tile | null | undefined) {
    if (!tile?.discovered || tile.terrain === 'towncenter' || !tile.variant) {
        return false;
    }

    return !!getBuildingDefinitionForTile(tile) || isRoadTile(tile) || isBridgeTile(tile);
}

const dismantleTask: TaskDefinition = {
    key: 'dismantle',
    label: 'Dismantle',
    allowInactiveTile: true,
    chainAdjacentSameTerrain: false,

    canStart(tile) {
        return isDismantlableConstruction(tile);
    },

    requiredXp(_distance: number) {
        return 900;
    },

    heroRate(hero: Hero) {
        return 18 * Math.max(1, hero.stats.atk);
    },

    onComplete(tile) {
        const removedBuilding = getBuildingDefinitionForTile(tile);
        if (!isDismantlableConstruction(tile)) {
            return;
        }

        applyVariant(tile, null, { stagger: false, respectBiome: false });

        if (removedBuilding) {
            onPopulationBuildingCompleted();
        }
    },
};

registerTask(dismantleTask);

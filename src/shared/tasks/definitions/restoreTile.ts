import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../../../core/types/Task';
import type { Hero } from '../../../core/types/Hero';
import type { Tile } from '../../../core/types/Tile';
import {
    hasFreeSupportCapacity,
    isTileControlled,
    listActiveAdjacentAccessTiles,
    markRestoreTileCompleted,
} from '../../game/state/settlementSupportStore';

const restoreTileTask: TaskDefinition = {
    key: 'restoreTile',
    label: 'Restore Tile',
    chainAdjacentSameTerrain: false,
    canStart(tile: Tile, _hero: Hero): boolean {
        return !!tile.discovered
            && tile.activationState === 'inactive'
            && isTileControlled(tile)
            && listActiveAdjacentAccessTiles(tile).length > 0
            && hasFreeSupportCapacity();
    },
    requiredXp(distance: number) {
        return Math.max(900, 650 + (distance * 120));
    },
    heroRate(hero: Hero) {
        return 18 * Math.max(1, hero.stats.atk);
    },
    onStart(_tile, instance) {
        instance.context = {
            ...(instance.context ?? {}),
            adjacentActiveAccess: true,
            restoreFromAdjacency: true,
        };
    },
    onComplete(tile, instance) {
        markRestoreTileCompleted(tile.id, instance.id);
    },
};

registerTask(restoreTileTask);

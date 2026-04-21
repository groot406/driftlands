import { registerTask } from '../taskRegistry';
import type { Hero } from '../../../core/types/Hero.ts';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { TileUpdatedMessage } from '../../protocol.ts';
import { broadcastGameMessage as broadcast } from '../../game/runtime.ts';
import { revealTileFeatures } from '../../game/tileFeatures.ts';

const surveyTileTask: TaskDefinition = {
    key: 'surveyTile',
    label: 'Survey Tile',
    chainAdjacentSameTerrain: false,

    canStart(tile) {
        return tile.discovered && tile.surveyed !== true;
    },

    requiredXp(_distance: number) {
        return 1200;
    },

    heroRate(hero: Hero) {
        return 24 * Math.max(1, hero.stats.spd);
    },

    onComplete(tile) {
        if (revealTileFeatures(tile)) {
            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        }
    },
};

registerTask(surveyTileTask);

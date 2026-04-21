import { registerTask } from '../taskRegistry';
import type { Hero } from '../../../core/types/Hero.ts';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { TileUpdatedMessage } from '../../protocol.ts';
import { broadcastGameMessage as broadcast } from '../../game/runtime.ts';
import { addStudyProgress, broadcastStudyState } from '../../../store/studyStore.ts';
import { STUDY_WORK_CYCLE_MS } from '../../studies/studies.ts';
import { hasRevealedSpecial } from '../../game/tileFeatures.ts';

const activateRuinsTask: TaskDefinition = {
    key: 'activateRuins',
    label: 'Activate Ruins',
    chainAdjacentSameTerrain: false,

    canStart(tile) {
        return hasRevealedSpecial(tile, 'ancient_ruins') && tile.specialActivated !== true;
    },

    requiredXp(_distance: number) {
        return 2600;
    },

    heroRate(hero: Hero) {
        return 20 * Math.max(1, hero.stats.spd);
    },

    onComplete(tile) {
        tile.specialActivated = true;
        addStudyProgress(2 * STUDY_WORK_CYCLE_MS);
        broadcastStudyState();
        broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
    },
};

registerTask(activateRuinsTask);

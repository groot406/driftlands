import type { Hero } from '../../../core/types/Hero.ts';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import { getActiveSideQuestForTask, getSideQuestRequiredResources } from '../../../store/sideQuestStore.ts';
import { RESCUE_HERO_TASK_KEY } from '../../sideQuests/definitions.ts';
import { registerTask } from '../taskRegistry.ts';

const rescueHeroTask: TaskDefinition = {
  key: RESCUE_HERO_TASK_KEY,
  label: 'Rescue Hero',
  chainAdjacentSameTerrain: false,

  canStart(tile) {
    return tile.discovered
      && !!getActiveSideQuestForTask(tile.id, RESCUE_HERO_TASK_KEY);
  },

  requiredXp() {
    return 3200;
  },

  heroRate(hero: Hero) {
    return 24 * Math.max(1, hero.stats.spd);
  },

  requiredResources(_distance, tile) {
    return tile ? getSideQuestRequiredResources(tile.id, RESCUE_HERO_TASK_KEY) : [];
  },

  totalRewardedStats() {
    return { xp: 8, hp: 0, atk: 0, spd: 0 };
  },
};

registerTask(rescueHeroTask);

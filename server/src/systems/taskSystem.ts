import type { TickContext } from '../tick';
import { updateActiveTasks } from '../../../src/shared/game/state/taskStore';
import { heroes } from '../../../src/shared/game/state/heroStore';

export const taskSystem = {
  name: 'tasks',
  init: () => {

  },
  tick: (_ctx: TickContext) => {
      updateActiveTasks(heroes)
  }
};

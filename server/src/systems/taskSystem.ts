import type { TickContext } from '../tick';
import { updateActiveTasks } from '../../../src/shared/game/state/taskStore';
import { heroes } from '../../../src/shared/game/state/heroStore';
import { seasonState } from '../state/seasonState';

export const taskSystem = {
  name: 'tasks',
  init: () => {

  },
  tick: (_ctx: TickContext) => {
      if (seasonState.isCompleted()) {
          return;
      }
      updateActiveTasks(heroes)
  }
};

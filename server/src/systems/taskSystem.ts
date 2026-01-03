import type { TickContext } from '../tick';
import {updateActiveTasks} from "../../../src/store/taskStore";
import {heroes} from "../../../src/store/heroStore";

export const taskSystem = {
  name: 'tasks',
  init: () => {

  },
  tick: (_ctx: TickContext) => {
      updateActiveTasks(heroes)
  }
};

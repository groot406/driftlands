import type { TaskType } from '../../core/types/Task.ts';
import type { SideQuestDefinition, SideQuestDefinitionId } from './types.ts';

export const RESCUE_HERO_TASK_KEY = 'rescueHero';

const SIDE_QUEST_DEFINITIONS: readonly SideQuestDefinition[] = [
  {
    id: 'lost_hero_distress',
    title: 'Distant Smoke',
    signal: {
      label: 'Distant smoke',
      minDistance: 7,
      maxDistance: 10,
    },
    npc: {
      id: 'trailbreaker_ren',
      name: 'Ren',
      role: 'Lost Trailbreaker',
      avatar: 'boy',
    },
    requiredResources: [
      { type: 'food', amount: 8 },
      { type: 'wood', amount: 10 },
      { type: 'tools', amount: 2 },
    ],
    objectives: [
      {
        id: 'stabilize_camp',
        kind: 'complete_task',
        title: 'Stabilize the camp',
        description: 'Bring supplies and complete the rescue work at the smoke signal.',
        taskType: RESCUE_HERO_TASK_KEY,
        target: 1,
        tileScope: 'quest_tile',
      },
    ],
    rewards: [
      {
        kind: 'hero',
        label: 'Ren joins your hero roster',
      },
    ],
    dialogue: {
      reveal: [
        'Smoke, finally. I thought the ridge had swallowed every road back. If you can brace the camp and spare supplies, I can still walk.',
        'This is no quick lift. I need food, timber for a splint frame, and tools before I can travel without slowing your whole crew.',
      ],
      complete: [
        'That holds. I owe your settlement more than thanks. Put me where the work is hardest and I will earn the bed.',
      ],
    },
  },
] as const;

export function listSideQuestDefinitions() {
  return SIDE_QUEST_DEFINITIONS.slice();
}

export function getSideQuestDefinition(id: SideQuestDefinitionId | string) {
  return SIDE_QUEST_DEFINITIONS.find((definition) => definition.id === id) ?? null;
}

export function listSideQuestTaskKeys(): TaskType[] {
  const taskKeys = new Set<TaskType>();
  for (const definition of SIDE_QUEST_DEFINITIONS) {
    for (const objective of definition.objectives) {
      if (objective.kind === 'complete_task') {
        taskKeys.add(objective.taskType);
      }
    }
  }

  return Array.from(taskKeys);
}

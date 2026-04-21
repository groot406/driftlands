import type { TaskType } from '../../core/types/Task.ts';
import type { BuildingKey, UpgradeKey } from '../story/progression.ts';

export type StudyKey =
  | 'field_notebooks'
  | 'masonry_treatises'
  | 'warehouse_ledgers'
  | 'crew_rosters'
  | 'tool_maintenance'
  | 'frontier_almanacs';

export type StudyUnlockKind = 'task' | 'building' | 'upgrade' | 'buff';

export interface StudyUnlockRef {
  kind: StudyUnlockKind;
  key: string;
  label: string;
  description: string;
}

export type StudyEffect =
  | { kind: 'job_output_multiplier'; multiplier: number };

export interface StudyDefinition {
  key: StudyKey;
  label: string;
  summary: string;
  requiredProgressMs: number;
  unlocks: StudyUnlockRef[];
  effects: StudyEffect[];
}

export const STUDY_WORK_CYCLE_MS = 60_000;

const STUDY_DEFINITIONS: readonly StudyDefinition[] = [
  {
    key: 'field_notebooks',
    label: 'Field Notebooks',
    summary: 'Settlers organize practical notes from farms, camps, and mines into shared working methods.',
    requiredProgressMs: 6 * STUDY_WORK_CYCLE_MS,
    unlocks: [
      {
        kind: 'buff',
        key: 'field_notebooks_output',
        label: 'Field Notebooks',
        description: 'Staffed production sites produce 10% more output.',
      },
    ],
    effects: [
      { kind: 'job_output_multiplier', multiplier: 1.1 },
    ],
  },
  {
    key: 'masonry_treatises',
    label: 'Masonry Treatises',
    summary: 'A long study of foundations, joints, and roof weight makes permanent housing safer to attempt.',
    requiredProgressMs: 9 * STUDY_WORK_CYCLE_MS,
    unlocks: [
      {
        kind: 'upgrade',
        key: 'stone_house_upgrade',
        label: 'Stone House',
        description: 'Rebuilds a basic house into sturdier stone housing with more beds.',
      },
    ],
    effects: [],
  },
  {
    key: 'warehouse_ledgers',
    label: 'Warehouse Ledgers',
    summary: 'Settlers study depot ledgers until the colony can expand frontier storage without losing track of stock.',
    requiredProgressMs: 12 * STUDY_WORK_CYCLE_MS,
    unlocks: [
      {
        kind: 'upgrade',
        key: 'warehouse_upgrade',
        label: 'Warehouse',
        description: 'Turns a frontier depot into a full-capacity warehouse.',
      },
    ],
    effects: [],
  },
  {
    key: 'crew_rosters',
    label: 'Crew Rosters',
    summary: 'Foremen compare shift notes until every staffed site can hand work between settlers with less waste.',
    requiredProgressMs: 8 * STUDY_WORK_CYCLE_MS,
    unlocks: [
      {
        kind: 'buff',
        key: 'crew_rosters_output',
        label: 'Crew Rosters',
        description: 'Staffed production sites produce 5% more output.',
      },
    ],
    effects: [
      { kind: 'job_output_multiplier', multiplier: 1.05 },
    ],
  },
  {
    key: 'tool_maintenance',
    label: 'Tool Maintenance',
    summary: 'Settlers standardize sharpening, haft repairs, and safe storage so each work cycle lands cleaner.',
    requiredProgressMs: 10 * STUDY_WORK_CYCLE_MS,
    unlocks: [
      {
        kind: 'buff',
        key: 'tool_maintenance_output',
        label: 'Tool Maintenance',
        description: 'Staffed production sites produce 10% more output.',
      },
    ],
    effects: [
      { kind: 'job_output_multiplier', multiplier: 1.1 },
    ],
  },
  {
    key: 'frontier_almanacs',
    label: 'Frontier Almanacs',
    summary: 'Weather, soil, shoreline, and ridge notes become seasonal calendars that keep production crews prepared.',
    requiredProgressMs: 14 * STUDY_WORK_CYCLE_MS,
    unlocks: [
      {
        kind: 'buff',
        key: 'frontier_almanacs_output',
        label: 'Frontier Almanacs',
        description: 'Staffed production sites produce 5% more output.',
      },
    ],
    effects: [
      { kind: 'job_output_multiplier', multiplier: 1.05 },
    ],
  },
];

export function listStudyDefinitions() {
  return STUDY_DEFINITIONS.slice();
}

export function getStudyDefinition(studyKey: string | null | undefined) {
  return STUDY_DEFINITIONS.find((study) => study.key === studyKey) ?? null;
}

export function getInitialStudyKey() {
  return STUDY_DEFINITIONS[0]?.key ?? null;
}

export function getNextStudyKey(completedStudyKeys: readonly string[]) {
  const completed = new Set(completedStudyKeys);
  return STUDY_DEFINITIONS.find((study) => !completed.has(study.key))?.key ?? null;
}

export function studyUnlocksContent(
  study: StudyDefinition,
  content: { kind: 'task'; key: TaskType | string }
    | { kind: 'building'; key: BuildingKey | string }
    | { kind: 'upgrade'; key: UpgradeKey | string },
) {
  return study.unlocks.some((unlock) => unlock.kind === content.kind && unlock.key === content.key);
}

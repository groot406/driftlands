import { broadcastGameMessage as broadcast } from '../shared/game/runtime';
import {
  getInitialStudyKey,
  getNextStudyKey,
  getStudyDefinition,
  listStudyDefinitions,
  studyUnlocksContent,
  type StudyDefinition,
  type StudyKey,
} from '../shared/studies/studies.ts';

export interface StudyProgressSnapshot {
  key: StudyKey;
  label: string;
  summary: string;
  requiredProgressMs: number;
  progressMs: number;
  completed: boolean;
  active: boolean;
  unlocks: StudyDefinition['unlocks'];
  effects: StudyDefinition['effects'];
}

export interface StudyStateSnapshot {
  activeStudyKey: StudyKey | null;
  completedStudyKeys: StudyKey[];
  studies: StudyProgressSnapshot[];
}

interface StudyState {
  activeStudyKey: StudyKey | null;
  completedStudyKeys: StudyKey[];
  progressByKey: Partial<Record<StudyKey, number>>;
}

const state: StudyState = {
  activeStudyKey: getInitialStudyKey(),
  completedStudyKeys: [],
  progressByKey: {},
};

function normalizeProgress(study: StudyDefinition, progressMs: number | null | undefined, completed: boolean) {
  if (completed) {
    return study.requiredProgressMs;
  }

  return Math.max(0, Math.min(study.requiredProgressMs, Math.round(progressMs ?? 0)));
}

function cloneStudyProgress(study: StudyDefinition): StudyProgressSnapshot {
  const completed = state.completedStudyKeys.includes(study.key);

  return {
    key: study.key,
    label: study.label,
    summary: study.summary,
    requiredProgressMs: study.requiredProgressMs,
    progressMs: normalizeProgress(study, state.progressByKey[study.key], completed),
    completed,
    active: state.activeStudyKey === study.key,
    unlocks: study.unlocks.map((unlock) => ({ ...unlock })),
    effects: study.effects.map((effect) => ({ ...effect })),
  };
}

function normalizeCompletedKeys(keys: readonly string[] | null | undefined): StudyKey[] {
  const known = new Set(listStudyDefinitions().map((study) => study.key));
  const result: StudyKey[] = [];

  for (const key of keys ?? []) {
    if (!known.has(key as StudyKey) || result.includes(key as StudyKey)) {
      continue;
    }

    result.push(key as StudyKey);
  }

  return result;
}

function chooseActiveStudyKey(activeStudyKey: StudyKey | null | undefined, completedStudyKeys: readonly StudyKey[]) {
  if (activeStudyKey && getStudyDefinition(activeStudyKey) && !completedStudyKeys.includes(activeStudyKey)) {
    return activeStudyKey;
  }

  return getNextStudyKey(completedStudyKeys);
}

export function resetStudyState() {
  state.completedStudyKeys = [];
  state.progressByKey = {};
  state.activeStudyKey = getInitialStudyKey();
}

export function loadStudySnapshot(snapshot: StudyStateSnapshot | null | undefined) {
  if (!snapshot) {
    resetStudyState();
    return;
  }

  state.completedStudyKeys = normalizeCompletedKeys(snapshot.completedStudyKeys);
  state.progressByKey = {};

  for (const studyProgress of snapshot.studies ?? []) {
    const study = getStudyDefinition(studyProgress.key);
    if (!study) {
      continue;
    }

    state.progressByKey[study.key] = normalizeProgress(
      study,
      studyProgress.progressMs,
      state.completedStudyKeys.includes(study.key),
    );
  }

  state.activeStudyKey = chooseActiveStudyKey(snapshot.activeStudyKey, state.completedStudyKeys);
}

export function getStudySnapshot(): StudyStateSnapshot {
  return {
    activeStudyKey: state.activeStudyKey,
    completedStudyKeys: state.completedStudyKeys.slice(),
    studies: listStudyDefinitions().map(cloneStudyProgress),
  };
}

export function getActiveStudyProgress() {
  const activeStudy = getStudyDefinition(state.activeStudyKey);
  return activeStudy ? cloneStudyProgress(activeStudy) : null;
}

export function hasActiveStudy() {
  return !!getStudyDefinition(state.activeStudyKey);
}

export function addStudyProgress(progressMs: number) {
  const activeStudy = getStudyDefinition(state.activeStudyKey);
  if (!activeStudy || progressMs <= 0) {
    return null;
  }

  const nextProgress = normalizeProgress(
    activeStudy,
    (state.progressByKey[activeStudy.key] ?? 0) + progressMs,
    false,
  );
  state.progressByKey[activeStudy.key] = nextProgress;

  if (nextProgress < activeStudy.requiredProgressMs) {
    return null;
  }

  if (!state.completedStudyKeys.includes(activeStudy.key)) {
    state.completedStudyKeys.push(activeStudy.key);
  }

  state.progressByKey[activeStudy.key] = activeStudy.requiredProgressMs;
  state.activeStudyKey = getNextStudyKey(state.completedStudyKeys);
  return activeStudy;
}

export function isContentUnlockedByStudies(content: Parameters<typeof studyUnlocksContent>[1]) {
  return state.completedStudyKeys.some((studyKey) => {
    const study = getStudyDefinition(studyKey);
    return !!study && studyUnlocksContent(study, content);
  });
}

export function getStudyJobOutputMultiplier() {
  return state.completedStudyKeys.reduce((multiplier, studyKey) => {
    const study = getStudyDefinition(studyKey);
    if (!study) {
      return multiplier;
    }

    return study.effects.reduce((innerMultiplier, effect) => {
      if (effect.kind === 'job_output_multiplier') {
        return innerMultiplier * effect.multiplier;
      }

      return innerMultiplier;
    }, multiplier);
  }, 1);
}

export function broadcastStudyState() {
  broadcast({
    type: 'studies:update',
    studies: getStudySnapshot(),
  });
}

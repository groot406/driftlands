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

const DEFAULT_STUDY_SCOPE = '__global__';

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
  settlementId?: string | null;
  activeStudyKey: StudyKey | null;
  completedStudyKeys: StudyKey[];
  studies: StudyProgressSnapshot[];
  settlements?: StudyStateSnapshot[];
}

interface StudyState {
  activeStudyKey: StudyKey | null;
  completedStudyKeys: StudyKey[];
  progressByKey: Partial<Record<StudyKey, number>>;
}

const studyStates = new Map<string, StudyState>();
const studyOverrideCompletedKeys = new Map<string, StudyKey[]>();

function normalizeStudyScope(settlementId: string | null | undefined) {
  const normalized = settlementId?.trim();
  return normalized || DEFAULT_STUDY_SCOPE;
}

function snapshotSettlementId(scope: string) {
  return scope === DEFAULT_STUDY_SCOPE ? null : scope;
}

function createStudyState(): StudyState {
  return {
    activeStudyKey: getInitialStudyKey(),
    completedStudyKeys: [],
    progressByKey: {},
  };
}

function ensureStudyState(settlementId?: string | null) {
  const scope = normalizeStudyScope(settlementId);
  let state = studyStates.get(scope);
  if (!state) {
    state = createStudyState();
    studyStates.set(scope, state);
  }

  return state;
}

function getEffectiveCompletedStudyKeys(settlementId?: string | null) {
  const scope = normalizeStudyScope(settlementId);
  const state = ensureStudyState(settlementId);
  return normalizeCompletedKeys([
    ...state.completedStudyKeys,
    ...(studyOverrideCompletedKeys.get(scope) ?? []),
  ]);
}

function normalizeProgress(study: StudyDefinition, progressMs: number | null | undefined, completed: boolean) {
  if (completed) {
    return study.requiredProgressMs;
  }

  return Math.max(0, Math.min(study.requiredProgressMs, Math.round(progressMs ?? 0)));
}

function cloneStudyProgress(study: StudyDefinition, state: StudyState, settlementId?: string | null): StudyProgressSnapshot {
  const completedStudyKeys = getEffectiveCompletedStudyKeys(settlementId);
  const completed = completedStudyKeys.includes(study.key);
  const activeStudyKey = chooseActiveStudyKey(state.activeStudyKey, completedStudyKeys);

  return {
    key: study.key,
    label: study.label,
    summary: study.summary,
    requiredProgressMs: study.requiredProgressMs,
    progressMs: normalizeProgress(study, state.progressByKey[study.key], completed),
    completed,
    active: activeStudyKey === study.key,
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

function applyStudySnapshotToScope(snapshot: StudyStateSnapshot, settlementId?: string | null) {
  const scope = normalizeStudyScope(settlementId ?? snapshot.settlementId ?? null);
  const state = createStudyState();
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
  studyStates.set(scope, state);
}

export function resetStudyState(settlementId?: string | null) {
  if (settlementId) {
    studyStates.set(normalizeStudyScope(settlementId), createStudyState());
    studyOverrideCompletedKeys.delete(normalizeStudyScope(settlementId));
    return;
  }

  studyStates.clear();
  studyOverrideCompletedKeys.clear();
  studyStates.set(DEFAULT_STUDY_SCOPE, createStudyState());
}

export function loadStudySnapshot(snapshot: StudyStateSnapshot | null | undefined, settlementId?: string | null) {
  if (!snapshot) {
    resetStudyState(settlementId);
    return;
  }

  if (!settlementId && Array.isArray(snapshot.settlements)) {
    studyStates.clear();
    if (snapshot.studies?.length) {
      applyStudySnapshotToScope(snapshot, snapshot.settlementId ?? null);
    } else {
      studyStates.set(DEFAULT_STUDY_SCOPE, createStudyState());
    }

    for (const settlementSnapshot of snapshot.settlements) {
      applyStudySnapshotToScope(settlementSnapshot, settlementSnapshot.settlementId ?? null);
    }
    return;
  }

  applyStudySnapshotToScope(snapshot, settlementId);
}

export function setStudyOverrides(completedStudyKeys: readonly string[] | null | undefined, settlementId?: string | null) {
  studyOverrideCompletedKeys.set(normalizeStudyScope(settlementId), normalizeCompletedKeys(completedStudyKeys));
}

export function getStudySnapshot(settlementId?: string | null): StudyStateSnapshot {
  const scope = normalizeStudyScope(settlementId);
  const state = ensureStudyState(settlementId);
  const completedStudyKeys = getEffectiveCompletedStudyKeys(settlementId);
  const activeStudyKey = chooseActiveStudyKey(state.activeStudyKey, completedStudyKeys);
  const snapshot: StudyStateSnapshot = {
    settlementId: snapshotSettlementId(scope),
    activeStudyKey,
    completedStudyKeys,
    studies: listStudyDefinitions().map((study) => cloneStudyProgress(study, state, settlementId)),
  };

  if (!settlementId) {
    snapshot.settlements = Array.from(studyStates.entries())
      .filter(([entryScope]) => entryScope !== DEFAULT_STUDY_SCOPE)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([entryScope]) => getStudySnapshot(entryScope));
  }

  return snapshot;
}

export function getActiveStudyProgress(settlementId?: string | null) {
  const activeStudy = getStudyDefinition(chooseActiveStudyKey(
    ensureStudyState(settlementId).activeStudyKey,
    getEffectiveCompletedStudyKeys(settlementId),
  ));
  return activeStudy ? cloneStudyProgress(activeStudy, ensureStudyState(settlementId), settlementId) : null;
}

export function hasActiveStudy(settlementId?: string | null) {
  return !!getStudyDefinition(chooseActiveStudyKey(
    ensureStudyState(settlementId).activeStudyKey,
    getEffectiveCompletedStudyKeys(settlementId),
  ));
}

export function addStudyProgress(progressMs: number, settlementId?: string | null) {
  const state = ensureStudyState(settlementId);
  const resolvedActiveStudyKey = chooseActiveStudyKey(state.activeStudyKey, getEffectiveCompletedStudyKeys(settlementId));
  const activeStudy = getStudyDefinition(resolvedActiveStudyKey);
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
  state.activeStudyKey = getNextStudyKey(getEffectiveCompletedStudyKeys(settlementId));
  return activeStudy;
}

export function selectActiveStudy(studyKey: string | null | undefined, settlementId?: string | null) {
  const study = getStudyDefinition(studyKey);
  if (!study || getEffectiveCompletedStudyKeys(settlementId).includes(study.key)) {
    return false;
  }

  const state = ensureStudyState(settlementId);
  if (state.activeStudyKey === study.key) {
    return true;
  }

  state.activeStudyKey = study.key;
  return true;
}

export function isContentUnlockedByStudies(content: Parameters<typeof studyUnlocksContent>[1], settlementId?: string | null) {
  return getEffectiveCompletedStudyKeys(settlementId).some((studyKey) => {
    const study = getStudyDefinition(studyKey);
    return !!study && studyUnlocksContent(study, content);
  });
}

export function isStudyCompleted(studyKey: string | null | undefined, settlementId?: string | null) {
  if (!studyKey) {
    return false;
  }

  return getEffectiveCompletedStudyKeys(settlementId).includes(studyKey as StudyKey);
}

export function getStudyJobOutputMultiplier(settlementId?: string | null) {
  return getEffectiveCompletedStudyKeys(settlementId).reduce((multiplier, studyKey) => {
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

export function broadcastStudyState(settlementId?: string | null) {
  broadcast({
    type: 'studies:update',
    studies: getStudySnapshot(settlementId),
  });
}

resetStudyState();

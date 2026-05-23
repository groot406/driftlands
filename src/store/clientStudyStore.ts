import { reactive, ref } from 'vue';
import { loadStudySnapshot, resetStudyState, type StudyStateSnapshot } from './studyStore.ts';

export const studyState = reactive<StudyStateSnapshot>({
  activeStudyKey: null,
  completedStudyKeys: [],
  studies: [],
});
export const studyStatesBySettlementId = reactive<Record<string, StudyStateSnapshot>>({});

export const studyVersion = ref(0);

function cloneSnapshot(snapshot: StudyStateSnapshot): StudyStateSnapshot {
  return {
    activeStudyKey: snapshot.activeStudyKey,
    completedStudyKeys: snapshot.completedStudyKeys.slice(),
    studies: snapshot.studies.map((study) => ({
      ...study,
      unlocks: study.unlocks.map((unlock) => ({ ...unlock })),
      effects: study.effects.map((effect) => ({ ...effect })),
    })),
    settlementId: snapshot.settlementId ?? null,
    settlements: snapshot.settlements?.map((settlement) => cloneSnapshot(settlement)),
  };
}

function replaceRootSnapshot(snapshot: StudyStateSnapshot) {
  studyState.activeStudyKey = snapshot.activeStudyKey;
  studyState.completedStudyKeys = snapshot.completedStudyKeys;
  studyState.studies = snapshot.studies;
  studyState.settlementId = snapshot.settlementId ?? null;
  studyState.settlements = snapshot.settlements;
}

function clearSettlementSnapshots() {
  for (const key of Object.keys(studyStatesBySettlementId)) {
    delete studyStatesBySettlementId[key];
  }
}

function setSettlementSnapshot(snapshot: StudyStateSnapshot) {
  if (!snapshot.settlementId) {
    return;
  }

  studyStatesBySettlementId[snapshot.settlementId] = cloneSnapshot({
    ...snapshot,
    settlements: undefined,
  });
}

export function loadStudyState(snapshot: StudyStateSnapshot) {
  const next = cloneSnapshot(snapshot);
  loadStudySnapshot(next);
  replaceRootSnapshot(next);
  clearSettlementSnapshots();
  for (const settlementSnapshot of next.settlements ?? []) {
    setSettlementSnapshot(settlementSnapshot);
  }
  studyVersion.value++;
}

export function updateStudyState(snapshot: StudyStateSnapshot) {
  if (snapshot.settlementId && !snapshot.settlements?.length) {
    const next = cloneSnapshot(snapshot);
    loadStudySnapshot(next, snapshot.settlementId);
    setSettlementSnapshot(next);
    if (studyState.settlementId === snapshot.settlementId) {
      replaceRootSnapshot(next);
    }
    studyVersion.value++;
    return;
  }

  loadStudyState(snapshot);
}

export function resetClientStudyState() {
  resetStudyState();
  studyState.activeStudyKey = null;
  studyState.completedStudyKeys = [];
  studyState.studies = [];
  studyState.settlementId = null;
  studyState.settlements = [];
  clearSettlementSnapshots();
  studyVersion.value++;
}

export function getStudyStateForSettlement(settlementId: string | null | undefined) {
  return settlementId ? studyStatesBySettlementId[settlementId] ?? studyState : studyState;
}

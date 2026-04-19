import { reactive, ref } from 'vue';
import { loadStudySnapshot, resetStudyState, type StudyStateSnapshot } from './studyStore.ts';

export const studyState = reactive<StudyStateSnapshot>({
  activeStudyKey: null,
  completedStudyKeys: [],
  studies: [],
});

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
  };
}

export function loadStudyState(snapshot: StudyStateSnapshot) {
  const next = cloneSnapshot(snapshot);
  loadStudySnapshot(next);
  studyState.activeStudyKey = next.activeStudyKey;
  studyState.completedStudyKeys = next.completedStudyKeys;
  studyState.studies = next.studies;
  studyVersion.value++;
}

export function updateStudyState(snapshot: StudyStateSnapshot) {
  loadStudyState(snapshot);
}

export function resetClientStudyState() {
  resetStudyState();
  studyState.activeStudyKey = null;
  studyState.completedStudyKeys = [];
  studyState.studies = [];
  studyVersion.value++;
}

import { ref } from 'vue';

/** Whether the conversation overlay should be re-opened from outside (e.g. recall button). */
export const chronicleReopenRequested = ref(0);
/** Simple flag so the recall button can hide when there are no entries. */
export const chronicleHasEntries = ref(false);

/** Goals panel visibility. */
export const isGoalsPanelOpen = ref(false);

/** Trigger a re-open of the conversation panel. */
export function requestChronicleReopen() {
  chronicleReopenRequested.value++;
}

export function toggleGoalsPanel() {
  isGoalsPanelOpen.value = !isGoalsPanelOpen.value;
}

export function openGoalsPanel() {
  isGoalsPanelOpen.value = true;
}

export function closeGoalsPanel() {
  isGoalsPanelOpen.value = false;
}


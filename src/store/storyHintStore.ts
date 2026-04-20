import { computed, ref } from 'vue';

export type StoryTileHintKind = 'forest' | 'water' | 'scout';

export interface StoryTileHint {
  id: string;
  kind: StoryTileHintKind;
  q: number;
  r: number;
  label: string;
  createdAt: number;
}

const activeStoryTileHints = ref<StoryTileHint[]>([]);

export const getActiveStoryTileHints = computed(() => activeStoryTileHints.value);

export function setStoryTileHint(hint: StoryTileHint) {
  activeStoryTileHints.value = [
    ...activeStoryTileHints.value.filter((entry) => entry.id !== hint.id),
    hint,
  ];
}

export function clearStoryTileHint(id: string) {
  const next = activeStoryTileHints.value.filter((entry) => entry.id !== id);
  if (next.length !== activeStoryTileHints.value.length) {
    activeStoryTileHints.value = next;
  }
}

export function clearStoryTileHints() {
  activeStoryTileHints.value = [];
}

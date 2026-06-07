import { computed, ref } from 'vue';
import type { ChangelogSnapshotMessage } from '../shared/protocol.ts';
import type { ReleaseChangelogEntry } from '../shared/changelog/changelog.ts';
import {
  getLatestChangelogTimestamp,
  getUnseenChangelogEntries,
  mergeChangelogEntries,
} from '../shared/changelog/changelog.ts';
import { generatedChangelogEntries } from '../shared/changelog/generated.ts';

const clientEntries = ref<ReleaseChangelogEntry[]>(generatedChangelogEntries.map(cloneEntry));
const serverEntries = ref<ReleaseChangelogEntry[]>([]);
const lastSeenChangelogAt = ref<number | null>(null);
export const changelogModalOpen = ref(false);

export const getMergedChangelogEntries = computed(() => (
  mergeChangelogEntries(clientEntries.value, serverEntries.value)
));

export const getPendingChangelogEntries = computed(() => (
  getUnseenChangelogEntries(getMergedChangelogEntries.value, lastSeenChangelogAt.value)
));

export function replaceChangelogSnapshot(message: Pick<ChangelogSnapshotMessage, 'entries' | 'lastSeenChangelogAt'>) {
  serverEntries.value = message.entries.map(cloneEntry);
  lastSeenChangelogAt.value = message.lastSeenChangelogAt;
  changelogModalOpen.value = getPendingChangelogEntries.value.length > 0;
}

export function acknowledgeChangelogEntries(): number | null {
  const seenAt = getLatestChangelogTimestamp(getPendingChangelogEntries.value);
  if (seenAt !== null) {
    lastSeenChangelogAt.value = Math.max(lastSeenChangelogAt.value ?? 0, seenAt);
  }
  changelogModalOpen.value = false;
  return seenAt;
}

export function closeChangelogModal() {
  changelogModalOpen.value = false;
}

export function resetChangelogStore() {
  clientEntries.value = generatedChangelogEntries.map(cloneEntry);
  serverEntries.value = [];
  lastSeenChangelogAt.value = null;
  changelogModalOpen.value = false;
}

export function setClientChangelogEntriesForTest(entries: ReleaseChangelogEntry[]) {
  clientEntries.value = entries.map(cloneEntry);
}

function cloneEntry(entry: ReleaseChangelogEntry): ReleaseChangelogEntry {
  return {
    ...entry,
    bullets: entry.bullets.slice(),
  };
}

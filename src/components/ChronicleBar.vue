<template>
  <button
    v-if="activeEntry"
    class="chronicle-bar pointer-events-auto"
    type="button"
    @click="openChronicle"
  >
    <div class="chronicle-bar__avatar">
      <img
        v-if="speakerAvatar"
        :src="speakerAvatar"
        :alt="activeEntry.speaker.name"
        class="h-12 w-12 pixel-art object-contain"
      />
      <div v-else class="chronicle-bar__glyph pixel-font">LOG</div>
    </div>

    <div class="min-w-0 flex-1 text-left">
      <div class="flex flex-wrap items-center gap-2">
        <span class="chronicle-bar__chip">{{ activeEntry.speaker.name }}</span>
        <span class="chronicle-bar__chip">Chapter {{ activeEntry.chapterNumber }}</span>
      </div>
      <p class="mt-2 text-sm font-semibold text-white">{{ headline }}</p>
      <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-300">{{ activeEntry.text }}</p>
    </div>

    <span class="chronicle-bar__cta">Open Chronicle</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { openWindow, WINDOW_IDS } from '../core/windowManager';
import { runSnapshot } from '../store/runStore.ts';
import boyAvatar from '../assets/heroes/boy.png';
import girlAvatar from '../assets/heroes/girl.png';
import loopheadAvatar from '../assets/heroes/loophead.png';
import santaAvatar from '../assets/heroes/santa.png';

const avatarByKey: Record<string, string> = {
  boy: boyAvatar,
  girl: girlAvatar,
  loophead: loopheadAvatar,
  santa: santaAvatar,
};

const activeEntry = computed(() => {
  const run = runSnapshot.value;
  if (!run) {
    return null;
  }

  return run.dialogue.entries.find((entry) => entry.id === run.dialogue.activeEntryId)
    ?? run.dialogue.entries[run.dialogue.entries.length - 1]
    ?? null;
});

const speakerAvatar = computed(() => {
  const avatarKey = activeEntry.value?.speaker.avatar ?? '';
  return avatarByKey[avatarKey] ?? null;
});

const headline = computed(() => {
  const entry = activeEntry.value;
  if (!entry) {
    return '';
  }

  switch (entry.kind) {
    case 'chapter_intro':
      return 'New chapter';
    case 'chapter_complete':
      return 'Chapter archived';
    case 'unlock':
      return 'Milestone unlocked';
    case 'advice':
      return 'Advisor note';
    case 'chapter_catchup':
      return 'Catch-up';
    default:
      return 'Chronicle update';
  }
});

function openChronicle() {
  openWindow(WINDOW_IDS.MISSION_CENTER);
}
</script>

<style scoped>
.chronicle-bar {
  @apply flex w-[min(92vw,34rem)] items-center gap-3 rounded-[1.6rem] border px-4 py-3 text-left shadow-2xl transition-colors;
  border-color: rgba(245, 195, 92, 0.18);
  background:
    linear-gradient(180deg, rgba(9, 18, 23, 0.94), rgba(10, 18, 24, 0.98)),
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.12), transparent 32%);
}

.chronicle-bar:hover {
  border-color: rgba(245, 195, 92, 0.32);
  background:
    linear-gradient(180deg, rgba(14, 24, 31, 0.96), rgba(10, 18, 24, 1)),
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.18), transparent 32%);
}

.chronicle-bar__avatar {
  @apply flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border;
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.74);
}

.chronicle-bar__glyph {
  @apply text-[11px] uppercase tracking-[0.22em] text-amber-200;
}

.chronicle-bar__chip {
  @apply rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-200;
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.68);
}

.chronicle-bar__cta {
  @apply hidden shrink-0 rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-amber-100 sm:inline-flex;
  border-color: rgba(245, 195, 92, 0.2);
  background: rgba(245, 158, 11, 0.12);
}
</style>

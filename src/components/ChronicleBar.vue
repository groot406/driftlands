<template>
  <Transition name="story-pop">
    <section v-if="visibleEntry" class="story-popup pointer-events-auto">
      <div class="story-popup__header">
        <div class="flex flex-wrap items-center gap-2">
          <span class="story-popup__chip story-popup__chip--accent">{{ visibleEntry.speaker.name }}</span>
          <span class="story-popup__chip">{{ headline }}</span>
        </div>
        <span class="story-popup__counter">{{ entryCounter }}</span>
      </div>

      <div class="story-popup__body">
        <div class="story-popup__avatar">
          <Sprite
            v-if="speakerAvatar"
            :sprite="speakerAvatar"
            :zoom="1.5"
            :row="8"
            :frame="0"
            :size="32"
            :aria-label="visibleEntry.speaker.name"
          />
          <div v-else class="story-popup__glyph pixel-font">LOG</div>
        </div>

        <div class="min-w-0 flex-1">
          <p class="story-popup__speaker">{{ visibleEntry.speaker.name }}</p>
          <p class="story-popup__text">{{ visibleEntry.text }}</p>
        </div>
      </div>

      <div class="story-popup__footer">
        <div class="story-popup__actions">
          <button
            v-if="canGoBack"
            class="story-popup__action"
            type="button"
            @click="showPreviousEntry"
          >
            Back
          </button>
          <button
            v-if="canGoForward"
            class="story-popup__action story-popup__action--primary"
            type="button"
            @click="showNextEntry"
          >
            Continue
          </button>
        </div>
        <button class="story-popup__dismiss" type="button" @click="dismissEntry">Hide</button>
      </div>
    </section>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Sprite from './Sprite.vue';
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

const selectedEntryId = ref<string | null>(null);
const dismissedEntryIds = ref<string[]>([]);

const entries = computed(() => runSnapshot.value?.dialogue.entries ?? []);
const activeEntryId = computed(() => runSnapshot.value?.dialogue.activeEntryId ?? null);

const activeEntry = computed(() => {
  if (!entries.value.length) {
    return null;
  }

  return entries.value.find((entry) => entry.id === activeEntryId.value)
    ?? entries.value[entries.value.length - 1]
    ?? null;
});

const currentEntry = computed(() => {
  if (!entries.value.length) {
    return null;
  }

  const entryId = selectedEntryId.value ?? activeEntry.value?.id ?? null;
  return entries.value.find((entry) => entry.id === entryId)
    ?? activeEntry.value
    ?? null;
});

const visibleEntry = computed(() => {
  const entry = currentEntry.value;
  if (!entry) {
    return null;
  }

  return dismissedEntryIds.value.includes(entry.id) ? null : entry;
});

const entryIndex = computed(() => {
  if (!visibleEntry.value) {
    return -1;
  }

  return entries.value.findIndex((entry) => entry.id === visibleEntry.value?.id);
});

const speakerAvatar = computed(() => {
  const avatarKey = visibleEntry.value?.speaker.avatar ?? '';
  return avatarByKey[avatarKey] ?? null;
});

const headline = computed(() => {
  switch (visibleEntry.value?.kind) {
    case 'chapter_intro':
      return 'Story';
    case 'unlock':
      return 'New Unlock';
    case 'advice':
      return 'Advice';
    default:
      return 'Conversation';
  }
});

const entryCounter = computed(() => {
  if (!visibleEntry.value || entryIndex.value < 0) {
    return '';
  }

  return `${entryIndex.value + 1} / ${entries.value.length}`;
});

const canGoBack = computed(() => entryIndex.value > 0);
const canGoForward = computed(() => entryIndex.value >= 0 && entryIndex.value < entries.value.length - 1);

watch(() => activeEntry.value?.id, (entryId) => {
  if (!entryId) {
    selectedEntryId.value = null;
    return;
  }

  if (!dismissedEntryIds.value.includes(entryId)) {
    selectedEntryId.value = entryId;
  }
});

function dismissEntry() {
  if (!currentEntry.value) {
    return;
  }

  if (!dismissedEntryIds.value.includes(currentEntry.value.id)) {
    dismissedEntryIds.value = [...dismissedEntryIds.value, currentEntry.value.id];
  }
}

function showPreviousEntry() {
  if (entryIndex.value <= 0) {
    return;
  }

  selectedEntryId.value = entries.value[entryIndex.value - 1]?.id ?? null;
}

function showNextEntry() {
  if (entryIndex.value < 0 || entryIndex.value >= entries.value.length - 1) {
    return;
  }

  selectedEntryId.value = entries.value[entryIndex.value + 1]?.id ?? null;
}
</script>

<style scoped>
.story-popup {
  @apply flex w-[min(92vw,32rem)] flex-col gap-3 rounded-[1.6rem] border px-4 py-3 shadow-2xl;
  border-color: rgba(245, 195, 92, 0.18);
  background:
    linear-gradient(180deg, rgba(9, 18, 23, 0.96), rgba(10, 18, 24, 0.99)),
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.12), transparent 32%);
}

.story-popup__header,
.story-popup__footer,
.story-popup__body {
  @apply flex items-center justify-between gap-3;
}

.story-popup__body {
  @apply items-start;
}

.story-popup__avatar {
  @apply flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border;
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.74);
}

.story-popup__glyph {
  @apply text-[11px] uppercase tracking-[0.22em] text-amber-200;
}

.story-popup__chip {
  @apply rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-200;
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.68);
}

.story-popup__chip--accent {
  border-color: rgba(245, 195, 92, 0.2);
  background: rgba(245, 158, 11, 0.12);
}

.story-popup__speaker {
  @apply text-sm font-semibold text-white;
}

.story-popup__text {
  @apply mt-2 text-sm leading-relaxed text-slate-200;
}

.story-popup__counter {
  @apply text-[11px] uppercase tracking-[0.16em] text-slate-400;
}

.story-popup__actions {
  @apply flex items-center gap-2;
}

.story-popup__action,
.story-popup__dismiss {
  @apply shrink-0 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-200 transition-colors;
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.74);
}

.story-popup__action--primary {
  border-color: rgba(245, 195, 92, 0.18);
  background: rgba(120, 53, 15, 0.44);
}

.story-popup__action:hover,
.story-popup__dismiss:hover {
  background: rgba(30, 41, 59, 0.88);
}

.story-pop-enter-active,
.story-pop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.story-pop-enter-from,
.story-pop-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>

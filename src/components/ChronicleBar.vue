<template>
  <!-- Backdrop overlay when conversation is active -->
  <Transition name="story-backdrop">
    <div
      v-if="visibleEntry"
      class="story-backdrop"
      @click="advanceOrDismiss"
    />
  </Transition>

  <!-- Centered conversation panel -->
  <Transition name="story-pop">
    <NineSlicePanel
      v-if="visibleEntry"
      as="section"
      type="small"
      class="story-popup pointer-events-auto"
      @click="advanceOrDismiss"
    >
      <div class="story-popup__header">
        <div class="flex flex-wrap items-center gap-2">
          <span class="story-popup__chip story-popup__chip--accent">{{ visibleEntry.speaker.name }}</span>
          <span class="story-popup__chip">{{ headline }}</span>
        </div>
        <span class="story-popup__counter">{{ entryCounter }}</span>
      </div>

      <div class="story-popup__body my-4">
        <div class="story-popup__avatar" :aria-label="visibleEntry.speaker.name">
          <div class="story-popup__avatar-stage">
            <Sprite
              v-if="speakerAvatar"
              :sprite="speakerAvatar"
              :fallback-sprite="speakerFallbackAvatar"
              :zoom="1.85"
              :row="8"
              :frame="0"
              :size="32"
              :aria-label="visibleEntry.speaker.name"
              class="story-popup__avatar-sprite"
            />
            <div v-else class="story-popup__glyph pixel-font">LOG</div>
          </div>
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
            @click.stop="showPreviousEntry"
          >
            Back
          </button>
          <button
            v-if="canGoForward"
            class="story-popup__action"
            type="button"
            @click.stop="showNextEntry"
          >
            Next
          </button>
          <button
            class="story-popup__action story-popup__action--primary"
            type="button"
            @click.stop="advanceOrDismiss"
          >
            {{ primaryActionLabel }}
          </button>
        </div>
        <span v-if="unreadCount > 1" class="story-popup__unread-badge">
          {{ unreadCount - 1 }} more
        </span>
        <button
          class="story-popup__dismiss"
          type="button"
          @click.stop="dismissAll"
        >
          Skip all
        </button>
      </div>
    </NineSlicePanel>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Sprite from './Sprite.vue';
import NineSlicePanel from './ui/NineSlicePanel.vue';
import { runSnapshot } from '../store/runStore.ts';
import { chronicleReopenRequested, chronicleHasEntries } from '../store/chronicleStore.ts';
import { activeToolbarPanel, closeToolbarPanel } from '../store/toolbarPanelStore.ts';
import boyAvatar from '../assets/heroes/boy.png';
import girlAvatar from '../assets/heroes/girl.png';
import loopheadAvatar from '../assets/heroes/loophead.png';
import mosslingAvatar from '../assets/heroes/mossling.png';
import santaAvatar from '../assets/heroes/santa.png';

const avatarByKey: Record<string, string> = {
  boy: boyAvatar,
  girl: girlAvatar,
  loophead: loopheadAvatar,
  mossling: mosslingAvatar,
  santa: santaAvatar,
};

/** IDs of entries the user has acknowledged (clicked through or dismissed). */
const acknowledgedIds = ref<Set<string>>(new Set());
/** Whether the panel was explicitly dismissed (hides until new entries arrive). */
const dismissed = ref(false);
/** Manual browse override: when set, shows this entry instead of the queue head. */
const browseEntryId = ref<string | null>(null);

const entries = computed(() => runSnapshot.value?.dialogue.entries ?? []);

/** Ordered list of entries the user hasn't clicked through yet. */
const unreadEntries = computed(() =>
  entries.value.filter((e) => !acknowledgedIds.value.has(e.id)),
);

const unreadCount = computed(() => unreadEntries.value.length);

/** The entry currently displayed. */
const currentEntry = computed(() => {
  if (browseEntryId.value) {
    return entries.value.find((e) => e.id === browseEntryId.value) ?? null;
  }
  return unreadEntries.value[0] ?? null;
});

const visibleEntry = computed(() => {
  if (dismissed.value) return null;
  return currentEntry.value;
});

const entryIndex = computed(() => {
  if (!visibleEntry.value) return -1;
  return entries.value.findIndex((e) => e.id === visibleEntry.value?.id);
});

const speakerAvatar = computed(() => {
  const speaker = visibleEntry.value?.speaker;
  if (!speaker) {
    return null;
  }

  if (speaker.avatarSource === 'looperlands' && speaker.avatarSpriteUrl) {
    return speaker.avatarSpriteUrl;
  }

  const avatarKey = speaker.avatar ?? '';
  return avatarByKey[avatarKey] ?? null;
});

const speakerFallbackAvatar = computed(() => {
  const speaker = visibleEntry.value?.speaker;
  return speaker?.avatarSource === 'looperlands' ? speaker.avatarFallbackSpriteUrl ?? undefined : undefined;
});

const headline = computed(() => {
  switch (visibleEntry.value?.kind) {
    case 'chapter_intro':
      return 'Story';
    case 'chapter_complete':
      return 'Chapter Complete';
    case 'unlock':
      return 'New Unlock';
    case 'advice':
      return 'Advice';
    case 'side_quest':
      return 'Side Quest';
    default:
      return 'Conversation';
  }
});

const entryCounter = computed(() => {
  if (!visibleEntry.value || entryIndex.value < 0) return '';
  return `${entryIndex.value + 1} / ${entries.value.length}`;
});

const canGoBack = computed(() => entryIndex.value > 0);
const canGoForward = computed(() => browseEntryId.value !== null && entryIndex.value >= 0 && entryIndex.value < entries.value.length - 1);
const hasMoreUnread = computed(() => unreadEntries.value.length > 1 || browseEntryId.value !== null);
const primaryActionLabel = computed(() => {
  if (browseEntryId.value !== null) {
    return unreadCount.value > 0 ? 'Resume' : 'Close';
  }

  return hasMoreUnread.value ? 'Continue' : 'Close';
});

// When new entries arrive, un-dismiss so the panel reappears automatically.
watch(
  () => entries.value.length,
  (newLen, oldLen) => {
    if (newLen > (oldLen ?? 0)) {
      dismissed.value = false;
      browseEntryId.value = null;
    }
  },
);

/** Advance to the next unread entry, or close the panel if done. */
function advanceOrDismiss() {
  const entry = currentEntry.value;
  if (!entry) {
    dismissed.value = true;
    closeToolbarPanel('chronicle');
    return;
  }

  // If browsing a specific entry, acknowledge it and return to queue.
  if (browseEntryId.value) {
    acknowledgedIds.value = new Set([...acknowledgedIds.value, browseEntryId.value]);
    browseEntryId.value = null;
    if (unreadEntries.value.length === 0) {
      dismissed.value = true;
      closeToolbarPanel('chronicle');
    }
    return;
  }

  // Acknowledge current queue head.
  acknowledgedIds.value = new Set([...acknowledgedIds.value, entry.id]);

  // If no more unread, close.
  if (unreadEntries.value.length === 0) {
    dismissed.value = true;
    closeToolbarPanel('chronicle');
  }
}

/** Skip all remaining unread entries and close. */
function dismissAll() {
  for (const e of unreadEntries.value) {
    acknowledgedIds.value = new Set([...acknowledgedIds.value, e.id]);
  }
  browseEntryId.value = null;
  dismissed.value = true;
  closeToolbarPanel('chronicle');
}

function showPreviousEntry() {
  if (entryIndex.value <= 0) return;
  browseEntryId.value = entries.value[entryIndex.value - 1]?.id ?? null;
}

function showNextEntry() {
  if (!canGoForward.value) return;
  browseEntryId.value = entries.value[entryIndex.value + 1]?.id ?? null;
}

/** Re-open the conversation showing the most recent entry. */
function reopenConversation() {
  dismissed.value = false;

  if (unreadEntries.value.length > 0) {
    // There are still unread entries – resume the queue.
    browseEntryId.value = null;
    return;
  }

  // Everything already acknowledged – jump to the last entry.
  if (entries.value.length > 0) {
    browseEntryId.value = entries.value[entries.value.length - 1].id;
  }
}

// Sync hasEntries flag to shared store so recall button can show/hide.
watch(() => entries.value.length, (len) => {
  chronicleHasEntries.value = len > 0;
}, { immediate: true });

// Listen for reopen requests from the recall button / keyboard shortcut.
watch(chronicleReopenRequested, () => {
  if (entries.value.length > 0) {
    reopenConversation();
  }
});

watch(activeToolbarPanel, (panel) => {
  if (panel !== 'chronicle' && visibleEntry.value) {
    dismissed.value = true;
    browseEntryId.value = null;
  }
});
</script>

<style scoped>
.story-backdrop {
  position: fixed;
  inset: 0;
  z-index: 49;
  background: rgba(2, 6, 23, 0.55);
  pointer-events: auto;
}

.story-popup {
  @apply flex w-[min(94vw,36rem)] flex-col gap-4 px-5 py-4;
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 50;
  cursor: pointer;
}

.story-popup__header,
.story-popup__footer {
  @apply flex items-center justify-between gap-3;
}

.story-popup__body {
  display: grid;
  grid-template-columns: 5.25rem minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  cursor: default;
}

.story-popup__avatar {
  position: relative;
  width: 5.25rem;
  height: 5.25rem;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(245, 195, 92, 0.32);
  background:
    linear-gradient(180deg, rgba(57, 42, 23, 0.76), rgba(15, 23, 42, 0.9)),
    radial-gradient(circle at 50% 8%, rgba(252, 211, 77, 0.22), transparent 58%);
  box-shadow:
    inset 0 1px 0 rgba(255, 244, 214, 0.14),
    inset 0 -10px 22px rgba(2, 6, 23, 0.45),
    0 12px 22px rgba(2, 6, 23, 0.24);
}

.story-popup__avatar::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    radial-gradient(circle at 50% 34%, rgba(96, 165, 250, 0.2), transparent 44%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.2), rgba(2, 6, 23, 0.52));
}

.story-popup__avatar::after {
  content: '';
  position: absolute;
  left: 15%;
  right: 15%;
  bottom: 0.65rem;
  height: 0.5rem;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.48);
  filter: blur(2px);
}

.story-popup__avatar-stage {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 0.15rem;
}

.story-popup__avatar-sprite {
  transform: translateY(0.28rem);
  filter: drop-shadow(0 6px 2px rgba(2, 6, 23, 0.36));
}

.story-popup__glyph {
  @apply text-[11px] uppercase tracking-[0.22em] text-amber-200;
  position: relative;
  z-index: 1;
}

.story-popup__chip {
  @apply rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-200;
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.68);
}

.story-popup__chip--accent {
  border-color: rgba(245, 195, 92, 0.2);
  background: rgba(245, 158, 11, 0.12);
}

.story-popup__speaker {
  @apply text-base font-semibold text-white;
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
  cursor: pointer;
}

.story-popup__action--primary {
  @apply px-4 py-2 text-[11px];
  border-color: rgba(245, 195, 92, 0.28);
  background: rgba(120, 53, 15, 0.55);
  color: #fde68a;
}

.story-popup__action--primary:hover {
  background: rgba(120, 53, 15, 0.72);
}

.story-popup__action:hover,
.story-popup__dismiss:hover {
  background: rgba(30, 41, 59, 0.88);
}

.story-popup__unread-badge {
  @apply rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em];
  border-color: rgba(245, 195, 92, 0.18);
  color: rgba(253, 230, 138, 0.7);
  background: rgba(120, 53, 15, 0.2);
}

.story-popup__footer {
  @apply flex items-center justify-between gap-3;
}

@media (max-width: 520px) {
  .story-popup__body {
    grid-template-columns: 4.25rem minmax(0, 1fr);
    gap: 0.8rem;
  }

  .story-popup__avatar {
    width: 4.25rem;
    height: 4.25rem;
    border-radius: 14px;
  }

  .story-popup__avatar-sprite {
    transform: translateY(0.15rem) scale(0.9);
  }
}

/* Backdrop transition */
.story-backdrop-enter-active,
.story-backdrop-leave-active {
  transition: opacity 0.25s ease;
}

.story-backdrop-enter-from,
.story-backdrop-leave-to {
  opacity: 0;
}

/* Panel transition */
.story-pop-enter-active,
.story-pop-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.story-pop-enter-from {
  opacity: 0;
  transform: translate(-50%, -46%);
}

.story-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -54%);
}
</style>

<template>
  <Transition name="tutorial-panel-pop">
    <aside
      v-if="isTutorialPanelOpen && visibleStep"
      ref="panelEl"
      class="tutorial-panel pointer-events-auto"
      :style="popoverStyle"
      aria-live="polite"
    >
      <header class="tutorial-panel__header">
        <div class="min-w-0">
          <p class="tutorial-panel__kicker">Field Guide</p>
          <h2 class="tutorial-panel__title">{{ visibleStep.title }}</h2>
        </div>
        <button class="tutorial-panel__close" type="button" title="Hide help guide" @click="closeGuidePanel">
          x
        </button>
      </header>

      <div class="tutorial-panel__mode-tabs" role="tablist" aria-label="Field guide sections">
        <button
          class="tutorial-panel__mode-tab"
          :class="{ 'tutorial-panel__mode-tab--active': activeMode === 'steps' }"
          type="button"
          @click="activeMode = 'steps'"
        >
          Steps
        </button>
        <button
          class="tutorial-panel__mode-tab"
          :class="{ 'tutorial-panel__mode-tab--active': activeMode === 'topics' }"
          type="button"
          @click="activeMode = 'topics'"
        >
          Topics
        </button>
      </div>

      <div v-if="activeMode === 'steps'" class="tutorial-panel__meta">
        <span class="tutorial-panel__chip" :class="`tutorial-panel__chip--${visibleStep.status}`">
          {{ stepStatusLabel }}
        </span>
        <span class="tutorial-panel__chip">
          {{ visibleTutorialStepNumber }}/{{ tutorialSnapshot.totalCount }}
        </span>
        <span class="tutorial-panel__chip">
          {{ tutorialSnapshot.completedCount }} done
        </span>
      </div>

      <div class="tutorial-panel__progress" aria-hidden="true">
        <div
          class="tutorial-panel__progress-fill"
          :style="{ width: `${overallProgressWidth}%` }"
        />
      </div>

      <section v-if="activeMode === 'steps'" class="tutorial-panel__body">
        <p class="tutorial-panel__objective">{{ visibleStep.objective }}</p>
        <p class="tutorial-panel__why">{{ visibleStep.why }}</p>
        <div class="tutorial-panel__action">
          <span class="tutorial-panel__action-label">Next</span>
          <span>{{ visibleStep.action }}</span>
        </div>
      </section>

      <section v-else class="tutorial-panel__topics" aria-label="Field guide topics">
        <article
          v-for="topic in fieldGuideTopics"
          :key="topic.id"
          class="tutorial-panel__topic"
        >
          <div class="tutorial-panel__topic-head">
            <span class="tutorial-panel__topic-category">{{ topic.category }}</span>
            <h3>{{ topic.title }}</h3>
          </div>
          <p>{{ topic.summary }}</p>
          <ul>
            <li v-for="cue in topic.cues" :key="cue">{{ cue }}</li>
          </ul>
        </article>
      </section>

      <div v-if="activeMode === 'steps'" class="tutorial-panel__step-progress">
        <span>{{ visibleStep.progressLabel }}</span>
        <div class="tutorial-panel__step-bar" aria-hidden="true">
          <div
            class="tutorial-panel__step-bar-fill"
            :class="{ 'tutorial-panel__step-bar-fill--done': visibleStep.completed }"
            :style="{ width: `${stepProgressWidth}%` }"
          />
        </div>
      </div>

      <footer v-if="activeMode === 'steps'" class="tutorial-panel__footer">
        <button
          class="tutorial-panel__nav"
          type="button"
          :disabled="!canGoPrevious"
          @click="showPreviousTutorialStep"
        >
          Back
        </button>
        <button
          v-if="!isViewingCurrentTutorialStep && tutorialSnapshot.currentStep"
          class="tutorial-panel__nav tutorial-panel__nav--primary"
          type="button"
          @click="showCurrentTutorialStep"
        >
          Current
        </button>
        <button
          class="tutorial-panel__nav"
          type="button"
          :disabled="!canGoNext"
          @click="showNextTutorialStep"
        >
          Next
        </button>
      </footer>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  closeTutorialPanel,
  isTutorialPanelOpen,
  isViewingCurrentTutorialStep,
  showCurrentTutorialStep,
  showNextTutorialStep,
  showPreviousTutorialStep,
  tutorialSnapshot,
  visibleTutorialStep,
  visibleTutorialStepNumber,
} from '../store/tutorialStore.ts';
import { getFieldGuideTopicDefinitions } from '../shared/tutorial/tutorialGuide.ts';
import { useToolbarPopoverPosition } from '../composables/useToolbarPopoverPosition.ts';
import { closeToolbarPanel } from '../store/toolbarPanelStore.ts';

const visibleStep = computed(() => visibleTutorialStep.value);
const activeMode = ref<'steps' | 'topics'>('steps');
const panelEl = ref<HTMLElement | null>(null);
const fieldGuideTopics = getFieldGuideTopicDefinitions();
const { popoverStyle } = useToolbarPopoverPosition({
  isOpen: isTutorialPanelOpen,
  panel: panelEl,
});

const stepStatusLabel = computed(() => {
  switch (visibleStep.value?.status) {
    case 'completed':
      return 'Complete';
    case 'current':
      return tutorialSnapshot.value.allCompleted ? 'Complete' : 'Current';
    case 'upcoming':
      return 'Upcoming';
    default:
      return 'Guide';
  }
});

const overallProgressWidth = computed(() => {
  const total = tutorialSnapshot.value.totalCount || 1;
  return Math.max(4, Math.min(100, (tutorialSnapshot.value.completedCount / total) * 100));
});

const stepProgressWidth = computed(() => {
  const step = visibleStep.value;
  if (!step) {
    return 0;
  }

  if (step.completed) {
    return 100;
  }

  if (step.target <= 0 || step.progress <= 0) {
    return 0;
  }

  return Math.max(8, Math.min(100, (step.progress / step.target) * 100));
});

const canGoPrevious = computed(() => (visibleStep.value?.index ?? 0) > 0);
const canGoNext = computed(() => {
  const step = visibleStep.value;
  return !!step && step.index < tutorialSnapshot.value.steps.length - 1;
});

function closeGuidePanel() {
  closeTutorialPanel();
  closeToolbarPanel('tutorial');
}
</script>

<style scoped>
.tutorial-panel {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  width: min(320px, calc(100vw - 32px));
  max-height: calc(100dvh - 8rem);
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.16), transparent 36%),
    radial-gradient(circle at 85% 20%, rgba(34, 211, 238, 0.12), transparent 26%),
    linear-gradient(180deg, rgba(16, 24, 39, 0.92), rgba(15, 23, 42, 0.9));
  color: rgb(248 250 252);
  box-shadow: 0 20px 38px rgba(2, 6, 23, 0.28);
  backdrop-filter: blur(18px);
}

.tutorial-panel__header,
.tutorial-panel__body,
.tutorial-panel__footer,
.tutorial-panel__meta,
.tutorial-panel__mode-tabs,
.tutorial-panel__topics,
.tutorial-panel__step-progress {
  padding-left: 1rem;
  padding-right: 1rem;
}

.tutorial-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
}

.tutorial-panel__kicker {
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  margin: 0;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(253, 186, 116, 0.9);
}

.tutorial-panel__title {
  margin: 6px 0 0;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.25;
  color: #f8fafc;
}

.tutorial-panel__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.5);
  color: rgba(248, 250, 252, 0.86);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.tutorial-panel__close:hover {
  border-color: rgba(245, 158, 11, 0.32);
  color: rgb(254 243 199);
}

.tutorial-panel__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.75rem;
}

.tutorial-panel__mode-tabs {
  display: flex;
  gap: 0.45rem;
  margin-top: 12px;
}

.tutorial-panel__mode-tab {
  min-height: 1.85rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.44);
  padding: 0.3rem 0.7rem;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(203 213 225);
}

.tutorial-panel__mode-tab:hover,
.tutorial-panel__mode-tab--active {
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(15, 23, 42, 0.58);
  color: rgb(253 230 138);
}

.tutorial-panel__chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.45rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.44);
  padding: 0.25rem 0.55rem;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(203 213 225);
}

.tutorial-panel__chip--completed {
  border-color: rgba(52, 211, 153, 0.36);
  color: rgb(167 243 208);
}

.tutorial-panel__chip--current {
  border-color: rgba(252, 211, 77, 0.48);
  color: rgb(254 240 138);
}

.tutorial-panel__progress {
  height: 0.35rem;
  margin-top: 0.85rem;
  background: rgba(15, 23, 42, 0.62);
}

.tutorial-panel__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(52 211 153), rgb(250 204 21));
  transition: width 0.35s ease;
}

.tutorial-panel__body {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 0;
  overflow-y: auto;
  margin: 12px 16px 0;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.44);
  padding: 10px 12px;
}

.tutorial-panel__objective {
  font-size: 0.9rem;
  font-weight: 750;
  line-height: 1.45;
  color: rgb(255 251 235);
}

.tutorial-panel__why {
  font-size: 0.78rem;
  line-height: 1.55;
  color: rgb(203 213 225);
}

.tutorial-panel__action {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.6rem;
  align-items: start;
  border: 1px solid rgba(245, 158, 11, 0.18);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.46);
  padding: 0.75rem;
  font-size: 0.78rem;
  line-height: 1.45;
  color: rgb(254 243 199);
}

.tutorial-panel__action-label {
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgb(252 211 77);
}

.tutorial-panel__topics {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  max-height: min(23rem, calc(100dvh - 15rem));
  margin-top: 12px;
  overflow-y: auto;
  padding-bottom: 14px;
}

.tutorial-panel__topic {
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.44);
  padding: 10px 12px;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.tutorial-panel__topic:hover {
  border-color: rgba(245, 158, 11, 0.18);
  background: rgba(15, 23, 42, 0.58);
}

.tutorial-panel__topic-head {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tutorial-panel__topic-category {
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgb(252 211 77);
}

.tutorial-panel__topic h3 {
  font-size: 0.85rem;
  font-weight: 800;
  line-height: 1.25;
  color: rgb(255 251 235);
}

.tutorial-panel__topic p,
.tutorial-panel__topic li {
  font-size: 0.74rem;
  line-height: 1.45;
  color: rgb(203 213 225);
}

.tutorial-panel__topic p {
  margin-top: 0.45rem;
}

.tutorial-panel__topic ul {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.55rem;
  padding-left: 1rem;
}

.tutorial-panel__step-progress {
  margin-top: 0.85rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(203 213 225);
}

.tutorial-panel__step-bar {
  height: 0.42rem;
  overflow: hidden;
  border-radius: 999px;
  margin-top: 0.45rem;
  background: rgba(15, 23, 42, 0.7);
}

.tutorial-panel__step-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: rgb(252 211 77);
  transition: width 0.35s ease;
}

.tutorial-panel__step-bar-fill--done {
  background: rgb(52 211 153);
}

.tutorial-panel__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.85rem;
  padding-bottom: 0.9rem;
}

.tutorial-panel__nav {
  min-height: 2.15rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.44);
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 800;
  color: rgb(226 232 240);
}

.tutorial-panel__nav:hover:not(:disabled) {
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(15, 23, 42, 0.58);
  color: rgb(254 243 199);
}

.tutorial-panel__nav:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.tutorial-panel__nav--primary {
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(245, 158, 11, 0.14);
  color: rgb(254 243 199);
}

.tutorial-panel-pop-enter-active,
.tutorial-panel-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.tutorial-panel-pop-enter-from,
.tutorial-panel-pop-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 640px) {
  .tutorial-panel {
    width: min(300px, calc(100vw - 24px));
    max-height: calc(100dvh - 108px);
  }
}
</style>

<template>
  <Transition name="tutorial-panel-pop">
    <aside
      v-if="isTutorialPanelOpen && visibleStep"
      class="tutorial-panel pointer-events-auto"
      aria-live="polite"
    >
      <header class="tutorial-panel__header">
        <div class="min-w-0">
          <p class="tutorial-panel__kicker">Field Guide</p>
          <h2 class="tutorial-panel__title">{{ visibleStep.title }}</h2>
        </div>
        <button class="tutorial-panel__close" type="button" title="Hide tutorial" @click="closeTutorialPanel">
          x
        </button>
      </header>

      <div class="tutorial-panel__meta">
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

      <section class="tutorial-panel__body">
        <p class="tutorial-panel__objective">{{ visibleStep.objective }}</p>
        <p class="tutorial-panel__why">{{ visibleStep.why }}</p>
        <div class="tutorial-panel__action">
          <span class="tutorial-panel__action-label">Next</span>
          <span>{{ visibleStep.action }}</span>
        </div>
      </section>

      <div class="tutorial-panel__step-progress">
        <span>{{ visibleStep.progressLabel }}</span>
        <div class="tutorial-panel__step-bar" aria-hidden="true">
          <div
            class="tutorial-panel__step-bar-fill"
            :class="{ 'tutorial-panel__step-bar-fill--done': visibleStep.completed }"
            :style="{ width: `${stepProgressWidth}%` }"
          />
        </div>
      </div>

      <footer class="tutorial-panel__footer">
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
import { computed } from 'vue';
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

const visibleStep = computed(() => visibleTutorialStep.value);

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
</script>

<style scoped>
.tutorial-panel {
  position: fixed;
  left: calc(50vw - 14rem);
  bottom: 1rem;
  z-index: 31;
  width: min(28rem, calc(100vw - 2rem));
  max-height: min(34rem, calc(100dvh - 2rem));
  overflow: hidden;
  border: 1px solid rgba(252, 211, 77, 0.28);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(20, 83, 45, 0.94), rgba(15, 23, 42, 0.94)),
    rgba(15, 23, 42, 0.94);
  color: rgb(248 250 252);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(12px);
}

.tutorial-panel__header,
.tutorial-panel__body,
.tutorial-panel__footer,
.tutorial-panel__meta,
.tutorial-panel__step-progress {
  padding-left: 1rem;
  padding-right: 1rem;
}

.tutorial-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.9rem;
}

.tutorial-panel__kicker {
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.58rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(253 230 138);
}

.tutorial-panel__title {
  margin-top: 0.35rem;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.25;
}

.tutorial-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.54);
  color: rgb(226 232 240);
  font-weight: 800;
  line-height: 1;
}

.tutorial-panel__close:hover {
  border-color: rgba(252, 211, 77, 0.5);
  color: rgb(254 243 199);
}

.tutorial-panel__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.75rem;
}

.tutorial-panel__chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.45rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.46);
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
  padding-top: 0.95rem;
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
  border: 1px solid rgba(252, 211, 77, 0.24);
  border-radius: 10px;
  background: rgba(120, 53, 15, 0.26);
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
  border: 1px solid rgba(148, 163, 184, 0.38);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.55);
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 800;
  color: rgb(226 232 240);
}

.tutorial-panel__nav:hover:not(:disabled) {
  border-color: rgba(252, 211, 77, 0.5);
  color: rgb(254 243 199);
}

.tutorial-panel__nav:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.tutorial-panel__nav--primary {
  border-color: rgba(252, 211, 77, 0.42);
  background: rgba(146, 64, 14, 0.46);
  color: rgb(254 243 199);
}

.tutorial-panel-pop-enter-active,
.tutorial-panel-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.tutorial-panel-pop-enter-from,
.tutorial-panel-pop-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

@media (max-width: 640px) {
  .tutorial-panel {
    left: 0.75rem;
    right: 0.75rem;
    bottom: 0.75rem;
    width: auto;
  }
}
</style>

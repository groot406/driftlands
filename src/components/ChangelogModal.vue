<template>
  <Transition name="smooth-modal" appear>
    <div
      v-if="changelogModalOpen"
      class="changelog-modal fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
    >
      <section class="changelog-modal__surface">
        <header class="changelog-modal__header">
          <p class="pixel-font changelog-modal__kicker">What is new</p>
          <h2 id="changelog-title">Since your last visit</h2>
          <p>{{ summaryText }}</p>
        </header>

        <div class="changelog-modal__list">
          <article
            v-for="entry in entries"
            :key="entry.id"
            class="changelog-modal__entry"
          >
            <div class="changelog-modal__entry-heading">
              <h3>{{ entry.title }}</h3>
              <span>{{ targetLabel(entry.target) }}</span>
            </div>
            <ul>
              <li v-for="bullet in entry.bullets" :key="`${entry.id}:${bullet}`">
                {{ bullet }}
              </li>
            </ul>
          </article>
        </div>

        <footer class="changelog-modal__footer">
          <button type="button" @click="acknowledge">
            Continue
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { acknowledgeChangelogEntries, changelogModalOpen, getPendingChangelogEntries } from '../store/changelogStore.ts';
import type { ChangelogTarget } from '../shared/changelog/changelog.ts';
import { sendMessage } from '../core/socket.ts';

const entries = getPendingChangelogEntries;
const summaryText = computed(() => {
  const count = entries.value.length;
  return count === 1
    ? 'One update landed while you were away.'
    : `${count} updates landed while you were away.`;
});

function targetLabel(target: ChangelogTarget) {
  switch (target) {
    case 'frontend':
      return 'Interface';
    case 'backend':
      return 'World';
    case 'both':
      return 'Game';
  }
}

function acknowledge() {
  const seenAt = acknowledgeChangelogEntries();
  if (seenAt !== null) {
    sendMessage({
      type: 'changelog:ack',
      seenAt,
      timestamp: Date.now(),
    });
  }
}
</script>

<style scoped>
.changelog-modal__surface {
  display: flex;
  flex-direction: column;
  width: min(92vw, 620px);
  max-height: min(84vh, 720px);
  overflow: hidden;
  border: 1px solid rgba(125, 211, 252, 0.28);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.97), rgba(2, 6, 23, 0.98)),
    rgba(15, 23, 42, 0.98);
  box-shadow: 0 26px 70px rgba(0, 0, 0, 0.46);
}

.changelog-modal__header {
  padding: 24px 24px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.changelog-modal__kicker {
  margin: 0 0 12px;
  color: rgb(186 230 253);
  font-size: 10px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.changelog-modal__header h2 {
  margin: 0;
  color: white;
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
}

.changelog-modal__header p {
  margin: 10px 0 0;
  color: rgb(203 213 225);
  font-size: 14px;
  line-height: 1.5;
}

.changelog-modal__list {
  min-height: 0;
  overflow-y: auto;
  padding: 18px 24px;
}

.changelog-modal__entry {
  padding: 16px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.changelog-modal__entry:first-child {
  padding-top: 0;
}

.changelog-modal__entry:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.changelog-modal__entry-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.changelog-modal__entry h3 {
  margin: 0;
  min-width: 0;
  color: white;
  font-size: 16px;
  font-weight: 750;
  line-height: 1.3;
}

.changelog-modal__entry span {
  flex: 0 0 auto;
  border: 1px solid rgba(45, 212, 191, 0.24);
  border-radius: 999px;
  padding: 4px 9px;
  color: rgb(153 246 228);
  background: rgba(20, 184, 166, 0.1);
  font-size: 11px;
  font-weight: 700;
}

.changelog-modal__entry ul {
  margin: 10px 0 0;
  padding-left: 20px;
  color: rgb(226 232 240);
  font-size: 14px;
  line-height: 1.55;
}

.changelog-modal__entry li + li {
  margin-top: 6px;
}

.changelog-modal__footer {
  display: flex;
  justify-content: flex-end;
  padding: 18px 24px 22px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.changelog-modal__footer button {
  min-width: 128px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 10px;
  padding: 10px 18px;
  color: rgb(8 47 73);
  background: linear-gradient(180deg, rgb(186 230 253), rgb(125 211 252));
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.changelog-modal__footer button:hover {
  filter: brightness(1.05);
}

@media (max-width: 520px) {
  .changelog-modal__surface {
    width: min(94vw, 420px);
    max-height: 88vh;
  }

  .changelog-modal__header,
  .changelog-modal__list,
  .changelog-modal__footer {
    padding-left: 18px;
    padding-right: 18px;
  }

  .changelog-modal__entry-heading {
    flex-direction: column;
    gap: 8px;
  }
}
</style>

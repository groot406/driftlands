<template>
  <Transition name="smooth-modal" appear>
    <div
      v-if="clientUpdateRequired"
      class="client-update-modal fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-update-title"
    >
      <section class="client-update-modal__surface">
        <header class="client-update-modal__header">
          <p class="pixel-font client-update-modal__kicker">Update ready</p>
          <h2 id="client-update-title">Reload Driftlands</h2>
          <p>A new game client is available. Reload to continue with the latest code.</p>
        </header>

        <footer class="client-update-modal__footer">
          <button type="button" @click="reloadClient">
            Reload
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { clientUpdateRequired } from '../store/clientUpdateStore.ts';

function reloadClient() {
  window.location.reload();
}
</script>

<style scoped>
.client-update-modal__surface {
  width: min(92vw, 520px);
  overflow: hidden;
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.99)),
    rgba(15, 23, 42, 0.98);
  box-shadow: 0 26px 70px rgba(0, 0, 0, 0.48);
}

.client-update-modal__header {
  padding: 24px 24px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.client-update-modal__kicker {
  margin: 0 0 12px;
  color: rgb(253 224 71);
  font-size: 10px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.client-update-modal__header h2 {
  margin: 0;
  color: white;
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
}

.client-update-modal__header p {
  margin: 10px 0 0;
  color: rgb(226 232 240);
  font-size: 14px;
  line-height: 1.5;
}

.client-update-modal__footer {
  display: flex;
  justify-content: flex-end;
  padding: 18px 24px 22px;
}

.client-update-modal__footer button {
  min-width: 128px;
  border: 1px solid rgba(250, 204, 21, 0.5);
  border-radius: 10px;
  padding: 10px 18px;
  color: rgb(66 32 6);
  background: linear-gradient(180deg, rgb(254 240 138), rgb(250 204 21));
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.client-update-modal__footer button:hover {
  filter: brightness(1.05);
}
</style>

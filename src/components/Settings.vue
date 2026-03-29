<template>
  <div class="flex flex-col gap-4">
    <!-- Settings Header -->
    <div class="flex items-center gap-3">
      <button @click="$emit('back')" class="text-slate-400 hover:text-white transition-colors">
        ← Back
      </button>
      <h2 class="pixel-font text-xl">Settings</h2>
    </div>

    <!-- Tab Navigation -->
    <div class="flex bg-slate-700/50 rounded-lg p-1 gap-1">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'flex-1 px-3 py-2 rounded text-xs font-medium transition-all duration-200',
          activeTab === tab.id
            ? 'bg-slate-600 text-white shadow-sm'
            : 'text-slate-300 hover:text-white hover:bg-slate-600/50'
        ]"
      >
        <span class="flex items-center justify-center gap-2">
          <component :is="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
        </span>
      </button>
    </div>

    <!-- Tab Content -->
    <div class="bg-slate-700/30 rounded-lg p-4 min-h-[300px]">
      <!-- Sound Settings Tab -->
      <div v-if="activeTab === 'sound'" class="space-y-4">
        <SoundSettings />
      </div>

      <!-- Graphics Settings Tab -->
      <div v-else-if="activeTab === 'graphics'" class="space-y-4">
        <GraphicsSettings />
      </div>
    </div>

    <!-- Footer -->
    <div class="flex justify-between items-center text-xs text-slate-400 border-t border-slate-600 pt-3">
      <span>Settings are automatically saved</span>
      <span>Press ESC to close</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SoundSettings from './SoundSettings.vue';
import GraphicsSettings from './settings/GraphicsSettings.vue';

// Simple icon components
const SoundIcon = { template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.79-1.59-1.76V9.99c0-.97.71-1.76 1.59-1.76h2.24z" /></svg>' };
const GraphicsIcon = { template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-1.16-.495-1.916-1.637-1.916-2.894 0-1.257.756-2.399 1.916-2.894M18.894 5.106c1.16.495 1.916 1.637 1.916 2.894 0 1.257-.756 2.399-1.916 2.894M12 12h.01" /></svg>' };

defineEmits<{
  back: [];
}>();

const activeTab = ref('sound');

const tabs = [
  { id: 'sound', label: 'Sound', icon: SoundIcon },
  { id: 'graphics', label: 'Graphics', icon: GraphicsIcon },
];
</script>

<style scoped>
/* Tab animations can be added here if needed */
</style>

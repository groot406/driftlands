<template>
  <div class="flex flex-col gap-4">
    <!-- Settings Header -->
    <div class="flex items-center gap-3">
      <button @click="$emit('back')" class="text-slate-400 hover:text-white transition-colors">
        ← Back
      </button>
      <h2 class="pixelfont text-xl">Settings</h2>
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

      <!-- Game Settings Tab -->
      <div v-else-if="activeTab === 'game'" class="space-y-4">
        <GameSettings />
      </div>

      <!-- Controls Settings Tab -->
      <div v-else-if="activeTab === 'controls'" class="space-y-4">
        <ControlsSettings />
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
import GameSettings from './settings/GameSettings.vue';
import ControlsSettings from './settings/ControlsSettings.vue';
import GraphicsSettings from './settings/GraphicsSettings.vue';

// Simple icon components
const SoundIcon = { template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.79-1.59-1.76V9.99c0-.97.71-1.76 1.59-1.76h2.24z" /></svg>' };
const GameIcon = { template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.007-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" /></svg>' };
const ControlsIcon = { template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>' };
const GraphicsIcon = { template: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-1.16-.495-1.916-1.637-1.916-2.894 0-1.257.756-2.399 1.916-2.894M18.894 5.106c1.16.495 1.916 1.637 1.916 2.894 0 1.257-.756 2.399-1.916 2.894M12 12h.01" /></svg>' };

defineEmits<{
  back: [];
}>();

const activeTab = ref('sound');

const tabs = [
  { id: 'sound', label: 'Sound', icon: SoundIcon },
  { id: 'game', label: 'Game', icon: GameIcon },
  { id: 'controls', label: 'Controls', icon: ControlsIcon },
  { id: 'graphics', label: 'Graphics', icon: GraphicsIcon },
];
</script>

<style scoped>
/* Tab animations can be added here if needed */
</style>

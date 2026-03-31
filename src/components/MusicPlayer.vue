<template>
  <div class="fixed bottom-16 right-4 z-30 pointer-events-auto">
    <!-- Collapsed: music icon toggle -->
    <Transition name="player-fade">
      <button
        v-if="!expanded"
        @click="expanded = true"
        class="music-toggle-btn"
        title="Open music player"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
          <path d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9.75 2.439v8.217a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66A1.5 1.5 0 007.5 13.9V4.272a.75.75 0 01.544-.721l11.25-3.188a.75.75 0 01.658.288z" />
        </svg>
        <!-- Animated bars when playing -->
        <div v-if="state.isPlaying" class="playing-bars">
          <span></span><span></span><span></span>
        </div>
      </button>
    </Transition>

    <!-- Expanded: full player -->
    <Transition name="player-slide">
      <div v-if="expanded" class="music-panel">
        <!-- Header row -->
        <div class="flex items-center justify-between mb-2">
          <span class="pixel-font text-[9px] uppercase tracking-[0.2em] text-amber-300/70">Now Playing</span>
          <button
            @click="expanded = false"
            class="text-slate-400 hover:text-white transition-colors p-0.5"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <!-- Track name -->
        <div class="track-name-container mb-3">
          <div class="track-name" :class="{ 'track-name-scroll': isTrackNameLong }">
            <span class="text-sm font-semibold text-white whitespace-nowrap">
              {{ state.trackName || 'No track' }}
            </span>
            <span v-if="isTrackNameLong" class="text-sm font-semibold text-white whitespace-nowrap ml-12">
              {{ state.trackName }}
            </span>
          </div>
        </div>

        <!-- Track counter -->
        <div class="text-center mb-2">
          <span class="text-[10px] text-slate-400 font-mono">
            {{ state.trackIndex + 1 }} / {{ state.totalTracks }}
          </span>
        </div>

        <!-- Transport controls -->
        <div class="flex items-center justify-center gap-3 mb-3">
          <button @click="musicManager.prev()" class="transport-btn" title="Previous track">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
              <path d="M9.195 18.44c1.25.713 2.805-.19 2.805-1.629V7.19c0-1.44-1.555-2.342-2.805-1.628L3.28 9.372a1.875 1.875 0 000 3.256l5.915 5.812zM15.195 18.44c1.25.714 2.805-.19 2.805-1.629V7.19c0-1.44-1.555-2.342-2.805-1.628L9.28 9.372a1.875 1.875 0 000 3.256l5.915 5.812z" />
            </svg>
          </button>

          <button @click="musicManager.togglePlayback()" class="transport-btn-main" :title="state.isPlaying ? 'Pause' : 'Play'">
            <!-- Pause icon -->
            <svg v-if="state.isPlaying" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
              <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" />
            </svg>
            <!-- Play icon -->
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
              <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
            </svg>
          </button>

          <button @click="musicManager.next()" class="transport-btn" title="Next track">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
              <path d="M5.055 7.06c-1.25-.713-2.805.19-2.805 1.629v9.622c0 1.44 1.555 2.342 2.805 1.628L11.97 14.13a1.875 1.875 0 000-3.256L5.055 5.06zM15.055 7.06c-1.25-.714-2.805.19-2.805 1.629v9.622c0 1.44 1.555 2.342 2.805 1.628l5.915-5.812a1.875 1.875 0 000-3.256L15.055 5.06z" />
            </svg>
          </button>
        </div>

        <!-- Volume slider -->
        <div class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-slate-400 shrink-0">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 01-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
            <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="soundStore.musicVolume"
            @input="updateVolume"
            class="music-slider flex-1"
          />
          <span class="text-[10px] text-slate-500 font-mono w-7 text-right">{{ Math.round(soundStore.musicVolume * 100) }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { musicManager, musicPlayerState } from '../core/musicManager';
import { soundStore, setMusicVolume } from '../store/soundStore';

const expanded = ref(false);
const state = musicPlayerState;

const isTrackNameLong = computed(() => (state.trackName?.length ?? 0) > 22);

function updateVolume(event: Event) {
  const target = event.target as HTMLInputElement;
  setMusicVolume(parseFloat(target.value));
}
</script>

<style scoped>
/* Toggle button (collapsed) */
.music-toggle-btn {
  @apply flex items-center gap-1.5 rounded-lg border border-slate-600/80 px-2.5 py-2 text-amber-200/80 shadow-lg backdrop-blur-sm transition-all hover:border-amber-300/50 hover:text-amber-200 cursor-pointer;
  background: rgba(2, 6, 23, 0.82);
}
.music-toggle-btn:hover {
  background: rgba(15, 23, 42, 0.92);
}

/* Playing bars animation */
.playing-bars {
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  height: 12px;
}
.playing-bars span {
  display: block;
  width: 2px;
  background: currentColor;
  border-radius: 1px;
  animation: bar-bounce 0.8s ease-in-out infinite;
}
.playing-bars span:nth-child(1) { height: 4px; animation-delay: 0s; }
.playing-bars span:nth-child(2) { height: 8px; animation-delay: 0.15s; }
.playing-bars span:nth-child(3) { height: 5px; animation-delay: 0.3s; }

@keyframes bar-bounce {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}

/* Expanded panel */
.music-panel {
  @apply rounded-2xl border border-slate-700/80 p-3.5 shadow-xl backdrop-blur-md;
  background: linear-gradient(
    160deg,
    rgba(2, 6, 23, 0.92) 0%,
    rgba(15, 23, 42, 0.88) 50%,
    rgba(2, 6, 23, 0.92) 100%
  );
  width: 220px;
}

/* Track name with marquee scroll */
.track-name-container {
  overflow: hidden;
  mask-image: linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%);
}

.track-name {
  display: flex;
  width: max-content;
}

.track-name-scroll {
  animation: marquee 12s linear infinite;
}

@keyframes marquee {
  0% { transform: translateX(0); }
  35% { transform: translateX(0); }
  50% { transform: translateX(-50%); }
  85% { transform: translateX(-50%); }
  100% { transform: translateX(0); }
}

/* Transport buttons */
.transport-btn {
  @apply flex items-center justify-center rounded-full p-1.5 text-slate-300 transition-all hover:text-white hover:bg-white/10 cursor-pointer;
}

.transport-btn-main {
  @apply flex items-center justify-center rounded-full p-2 text-amber-200 transition-all hover:text-amber-100 cursor-pointer;
  background: radial-gradient(circle at 50% 40%, rgba(251, 191, 36, 0.2) 0%, rgba(251, 191, 36, 0.05) 70%, transparent 100%);
  border: 1px solid rgba(251, 191, 36, 0.3);
}
.transport-btn-main:hover {
  border-color: rgba(251, 191, 36, 0.5);
  background: radial-gradient(circle at 50% 40%, rgba(251, 191, 36, 0.3) 0%, rgba(251, 191, 36, 0.1) 70%, transparent 100%);
}

/* Volume slider */
.music-slider {
  @apply h-1 rounded-lg appearance-none cursor-pointer;
  background: linear-gradient(to right, rgba(251, 191, 36, 0.3), rgba(251, 191, 36, 0.15));
}

.music-slider::-webkit-slider-thumb {
  @apply appearance-none w-3 h-3 rounded-full cursor-pointer transition-colors;
  background: rgb(251, 191, 36);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
}
.music-slider::-webkit-slider-thumb:hover {
  background: rgb(252, 211, 77);
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
}

.music-slider::-moz-range-thumb {
  @apply w-3 h-3 rounded-full cursor-pointer border-0 transition-colors;
  background: rgb(251, 191, 36);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
}
.music-slider::-moz-range-thumb:hover {
  background: rgb(252, 211, 77);
}

/* Transitions */
.player-fade-enter-active,
.player-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.player-fade-enter-from,
.player-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.player-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.player-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.player-slide-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}
.player-slide-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.97);
}
</style>

<template>
  <div
    v-if="isModalOpen"
    class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
    @click.self="closeModal"
  >
    <div class="bg-gray-900 border border-gray-600 rounded-lg p-6 w-96 w-[90vw] max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          Online Players ({{ playerCount }})
        </h2>
        <button
          @click="closeModal"
          class="text-gray-400 hover:text-white transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Players List -->
      <div class="flex flex-row gap-4">
      <div class="mb-4 w-[250px]">
        <h3 class="text-sm font-semibold text-gray-300 mb-2">Other Players</h3>
        <div class="space-y-1 overflow-y-auto max-h-[50vh]">
          <div
            v-for="player in connectedPlayers"
            :key="player.id"
            class="flex items-center gap-2 px-2 py-1 rounded bg-gray-800"
          >
            <div class="w-2 h-2 bg-green-400 rounded-full"></div>
            <span class="text-sm text-gray-200">{{ player.name }}</span>
          </div>
          <div v-if="connectedPlayers.length === 0" class="text-sm text-gray-500 italic px-2">
            No other players online
          </div>
        </div>
      </div>

      <!-- Chat Section -->
      <div class="flex-1 flex flex-col min-h-0">
        <h3 class="text-sm font-semibold text-gray-300 mb-2">Chat</h3>

        <!-- Chat Messages -->
        <div
          ref="chatContainer"
          class="flex-1 bg-gray-800 rounded-lg p-3 overflow-y-auto min-h-[200px] max-h-[300px] mb-3"
        >
          <div v-if="chatMessages.length === 0" class="text-sm text-gray-500 italic">
            No messages yet. Start a conversation!
          </div>
          <div
            v-for="message in chatMessages"
            :key="message.id"
            class="mb-2 last:mb-0"
          >
            <div class="flex items-start gap-2">
              <span class="text-xs text-gray-400 shrink-0">
                {{ formatTime(message.timestamp) }}
              </span>
              <span class="text-sm font-medium text-blue-300">{{ message.playerName }}</span>
            </div>
            <div class="text-sm text-gray-200 ml-10 break-words p-1 px-2 mt-1 mb-3 bg-slate-500/20 rounded">
              {{ message.message }}
            </div>
          </div>
        </div>

        <!-- Chat Input -->
        <div class="flex gap-2">
          <input
            ref="chatInput"
            v-model="newMessage"
            @keydown.enter="sendChatMessage"
            placeholder="Type a message..."
            class="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            maxlength="200"
          />
          <button
            @click="sendChatMessage"
            :disabled="!newMessage.trim()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { getChatMessages, getIsPlayerModalOpen, setPlayerModalOpen } from '../store/chatStore';
import { getConnectedPlayers, getOnlinePlayersCount } from '../store/playerStore';
import { sendMessage, getCurrentPlayerInfo } from '../core/socket';
import { openWindow, closeWindow, WINDOW_IDS, isWindowActive } from '../core/windowManager';

const newMessage = ref('');
const chatContainer = ref<HTMLDivElement>();
const chatInput = ref<HTMLInputElement>();

const isModalOpen = getIsPlayerModalOpen;
const chatMessages = getChatMessages;
const connectedPlayers = getConnectedPlayers;
const playerCount = getOnlinePlayersCount;

function closeModal() {
  setPlayerModalOpen(false);
  closeWindow(WINDOW_IDS.PLAYER_MODAL);
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sendChatMessage() {
  const message = newMessage.value.trim();
  if (!message) return;

  const playerInfo = getCurrentPlayerInfo();
  if (!playerInfo) {
    console.warn('Cannot send message - no player info available');
    return;
  }

  sendMessage({
    type: 'chat:message',
    playerId: playerInfo.id,
    playerName: playerInfo.name,
    message: message,
    timestamp: Date.now()
  });

  newMessage.value = '';
}

// Auto-scroll to bottom when new messages arrive
watch(chatMessages, () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
}, { deep: true });

// Auto-focus chat input when modal opens and register with window manager
watch(isModalOpen, (newValue) => {
  if (newValue) {
    openWindow(WINDOW_IDS.PLAYER_MODAL);
    nextTick(() => {
      chatInput.value?.focus();
    });
  } else {
    closeWindow(WINDOW_IDS.PLAYER_MODAL);
  }
});

// Handle Escape key to close modal
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isWindowActive(WINDOW_IDS.PLAYER_MODAL)) {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
  }
}

// Add/remove escape key listener
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

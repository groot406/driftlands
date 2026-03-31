<template>
  <div v-if="isOpen" class="player-modal-backdrop" @click="close">
    <div class="player-modal-panel" @click.stop>
      <div class="player-modal-header">
        <div>
          <p class="player-modal-eyebrow">Party</p>
          <h2 class="player-modal-title">Connected Players</h2>
        </div>
        <button class="player-modal-close" @click="close" title="Close">
          ✕
        </button>
      </div>

      <div class="player-modal-body">
        <!-- Left: Player List -->
        <div class="player-section">
          <div class="player-list">
            <div v-for="player in players" :key="player.id" class="player-row">
              <div class="player-main">
                <span class="player-name">
                  {{ player.name }}
                  <span v-if="isCurrentPlayer(player.id)" class="player-you">(you)</span>
                </span>
                <span class="player-status" :class="{ 'player-status-ready': player.ready }">
                  {{ player.ready ? 'Ready' : 'Preparing' }}
                </span>
              </div>
              <div class="player-meta">
                <span>{{ player.claimedHeroIds.length }} heroes claimed</span>
              </div>
            </div>

            <div v-if="players.length === 0" class="player-empty">
              Waiting for the first traveler to join.
            </div>
          </div>

          <!-- Ready Toggle -->
          <button
            class="ready-toggle"
            :class="{ 'ready-toggle-active': isReady }"
            @click="toggleReady"
          >
            {{ isReady ? 'Unready' : 'Ready Up' }}
          </button>
        </div>

        <!-- Right: Chat -->
        <div class="chat-section">
          <div class="chat-messages" ref="chatMessagesEl">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="chat-bubble"
              :class="{ 'chat-bubble-own': isOwnMessage(msg.playerId) }"
            >
              <span v-if="!isOwnMessage(msg.playerId)" class="chat-sender">{{ msg.playerName }}</span>
              <span class="chat-text">{{ msg.message }}</span>
              <span class="chat-time">{{ formatTime(msg.timestamp) }}</span>
            </div>
            <div v-if="messages.length === 0" class="chat-empty">
              No messages yet. Say hello!
            </div>
          </div>

          <form class="chat-input-row" @submit.prevent="sendChat">
            <input
              ref="chatInputEl"
              v-model="newMessage"
              class="chat-input"
              type="text"
              placeholder="Type a message..."
              maxlength="200"
              autocomplete="off"
            />
            <button
              class="chat-send"
              type="submit"
              :disabled="!newMessage.trim()"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { getConnectedPlayers } from '../store/playerStore';
import { getChatMessages, getIsPlayerModalOpen, setPlayerModalOpen } from '../store/chatStore';
import { closeWindow, isWindowActive, WINDOW_IDS } from '../core/windowManager';
import { currentPlayerId, sendMessage } from '../core/socket';
import { setReadyState } from '../core/coopService';

const isOpen = computed(() => getIsPlayerModalOpen.value);
const players = computed(() => getConnectedPlayers.value);
const messages = computed(() => getChatMessages.value);

const newMessage = ref('');
const chatMessagesEl = ref<HTMLElement | null>(null);
const chatInputEl = ref<HTMLInputElement | null>(null);

const isReady = computed(() => {
  const myId = currentPlayerId.value;
  if (!myId) return false;
  const me = players.value.find((p) => p.id === myId);
  return me?.ready ?? false;
});

function isCurrentPlayer(playerId: string) {
  return playerId === currentPlayerId.value;
}

function isOwnMessage(playerId: string) {
  return playerId === currentPlayerId.value;
}

function toggleReady() {
  setReadyState(!isReady.value);
}

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sendChat() {
  const text = newMessage.value.trim();
  if (!text) return;

  const myId = currentPlayerId.value;
  const me = players.value.find((p) => p.id === myId);

  sendMessage({
    type: 'chat:message',
    playerId: myId ?? 'unknown',
    playerName: me?.name ?? 'Pioneer',
    message: text,
    timestamp: Date.now(),
  });

  newMessage.value = '';
}

function scrollToBottom() {
  nextTick(() => {
    const el = chatMessagesEl.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

// Auto-scroll when new messages arrive
watch(messages, () => {
  scrollToBottom();
}, { deep: true });

// Focus input when modal opens
watch(isOpen, (open) => {
  if (open) {
    nextTick(() => {
      chatInputEl.value?.focus();
    });
    scrollToBottom();
  }
});

function close() {
  setPlayerModalOpen(false);
  closeWindow(WINDOW_IDS.PLAYER_MODAL);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isWindowActive(WINDOW_IDS.PLAYER_MODAL)) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}

let listenerActive = false;

watch(isOpen, (nextOpen) => {
  if (nextOpen && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!nextOpen && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
}, { immediate: true });

onUnmounted(() => {
  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<style scoped>
.player-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 23, 0.68);
  backdrop-filter: blur(8px);
}

.player-modal-panel {
  width: min(760px, 100%);
  max-height: 80vh;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.84)),
    radial-gradient(circle at top, rgba(14, 165, 233, 0.12), transparent 58%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
}

.player-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 20px 14px 20px;
  flex-shrink: 0;
}

.player-modal-eyebrow {
  margin: 0 0 4px 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.72);
}

.player-modal-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.1;
}

.player-modal-close {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.78);
  color: inherit;
  cursor: pointer;
}

/* --- Body: two-column layout --- */
.player-modal-body {
  display: flex;
  gap: 16px;
  padding: 0 20px 20px 20px;
  min-height: 0;
  flex: 1;
}

/* --- Left column: players + ready button --- */
.player-section {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex: 1;
}

.player-row {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.58);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.player-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.player-name {
  font-weight: 600;
}

.player-you {
  font-weight: 400;
  font-size: 12px;
  color: rgba(125, 211, 252, 0.72);
}

.player-status {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(71, 85, 105, 0.44);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(226, 232, 240, 0.8);
  flex-shrink: 0;
}

.player-status-ready {
  background: rgba(34, 197, 94, 0.18);
  color: rgba(187, 247, 208, 0.96);
}

.player-meta {
  margin-top: 8px;
  font-size: 13px;
  color: rgba(203, 213, 225, 0.76);
}

.player-empty {
  padding: 18px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.42);
  color: rgba(203, 213, 225, 0.76);
  text-align: center;
}

/* Ready toggle button */
.ready-toggle {
  padding: 10px 0;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
  color: rgba(226, 232, 240, 0.9);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  flex-shrink: 0;
}

.ready-toggle:hover {
  background: rgba(34, 197, 94, 0.14);
  border-color: rgba(34, 197, 94, 0.36);
  color: rgba(187, 247, 208, 0.96);
}

.ready-toggle-active {
  background: rgba(34, 197, 94, 0.22);
  border-color: rgba(34, 197, 94, 0.44);
  color: rgba(187, 247, 208, 0.96);
}

.ready-toggle-active:hover {
  background: rgba(239, 68, 68, 0.14);
  border-color: rgba(239, 68, 68, 0.36);
  color: rgba(252, 165, 165, 0.96);
}

/* --- Right column: chat --- */
.chat-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.42);
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
  max-height: 340px;
}

.chat-bubble {
  display: flex;
  flex-direction: column;
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(56, 89, 138, 0.38);
  align-self: flex-start;
  word-break: break-word;
}

.chat-bubble-own {
  align-self: flex-end;
  background: rgba(34, 120, 80, 0.38);
}

.chat-sender {
  font-size: 11px;
  font-weight: 600;
  color: rgba(125, 211, 252, 0.8);
  margin-bottom: 2px;
}

.chat-text {
  font-size: 14px;
  line-height: 1.4;
}

.chat-time {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.6);
  margin-top: 2px;
  align-self: flex-end;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(148, 163, 184, 0.5);
  font-size: 13px;
}

/* Chat input row */
.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.7);
  color: #f8fafc;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}

.chat-input::placeholder {
  color: rgba(148, 163, 184, 0.45);
}

.chat-input:focus {
  border-color: rgba(125, 211, 252, 0.5);
}

.chat-send {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(125, 211, 252, 0.3);
  background: rgba(14, 165, 233, 0.18);
  color: rgba(186, 230, 253, 0.92);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
}

.chat-send:hover:not(:disabled) {
  background: rgba(14, 165, 233, 0.3);
  border-color: rgba(125, 211, 252, 0.5);
}

.chat-send:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

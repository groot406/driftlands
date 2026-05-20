<template>
  <Transition name="smooth-modal" appear>
    <div v-if="isOpen" class="player-modal-backdrop smooth-modal-backdrop" @click.self="close">
      <PanelModalShell
        as="div"
        class="player-modal-panel"
        close-aria-label="Close player chat"
        header-label="Party"
        header-title="Connected Players"
        header-icon="⌂"
        @close="close"
      >
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
                </div>
                <div class="player-meta">
                  <span>{{ player.claimedHeroIds.length }} heroes claimed</span>
                </div>
              </div>

              <div v-if="players.length === 0" class="player-empty">
                Waiting for the first traveler to join.
              </div>
            </div>
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
              <PanelActionButton
                class="chat-send"
                type="submit"
                size="small"
                :disabled="!newMessage.trim()"
              >
                Send
              </PanelActionButton>
            </form>
          </div>
        </div>
      </PanelModalShell>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { getConnectedPlayers } from '../store/playerStore';
import { getChatMessages, getIsPlayerModalOpen, setPlayerModalOpen } from '../store/chatStore';
import { closeWindow, isWindowActive, WINDOW_IDS } from '../core/windowManager';
import { currentPlayerId, sendMessage } from '../core/socket';
import PanelActionButton from './ui/PanelActionButton.vue';
import PanelModalShell from './ui/PanelModalShell.vue';

const isOpen = computed(() => getIsPlayerModalOpen.value);
const players = computed(() => getConnectedPlayers.value);
const messages = computed(() => getChatMessages.value);

const newMessage = ref('');
const chatMessagesEl = ref<HTMLElement | null>(null);
const chatInputEl = ref<HTMLInputElement | null>(null);

function isCurrentPlayer(playerId: string) {
  return playerId === currentPlayerId.value;
}

function isOwnMessage(playerId: string) {
  return playerId === currentPlayerId.value;
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
  padding: 24px;
  background:
    radial-gradient(circle at 24% 42%, rgba(50, 66, 47, 0.22), transparent 23rem),
    radial-gradient(circle at 54% 112%, rgba(57, 80, 57, 0.14), transparent 28rem),
    rgba(1, 5, 12, 0.78);
  backdrop-filter: blur(4px) saturate(0.82) brightness(0.78);
}

.player-modal-panel {
  box-sizing: border-box;
  width: min(64rem, calc(100vw - 32px));
  height: min(43rem, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border-radius: 0;
  --panel-modal-border-width: 20px;
  --panel-header-title-size: clamp(1.95rem, 3vw, 2.35rem);
}

/* --- Body: two-column layout --- */
.player-modal-body {
  display: grid;
  grid-template-columns: minmax(16rem, 18rem) minmax(0, 1fr);
  gap: 0.95rem;
  padding: 0.95rem 1.1rem 1.1rem;
  min-height: 0;
  flex: 1;
}

/* --- Left column: players + ready button --- */
.player-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  min-height: 0;
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-right: 0.35rem;
}

.player-row {
  padding: 0.82rem 0.9rem;
  border: 1px solid rgba(132, 94, 44, 0.26);
  border-radius: 0;
  background:
    linear-gradient(90deg, rgba(65, 45, 26, 0.13), rgba(15, 17, 18, 0.3)),
    rgba(13, 15, 16, 0.5);
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.28);
}

.player-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.player-name {
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 600;
}

.player-you {
  font-weight: 400;
  font-size: 12px;
  color: rgba(201, 154, 75, 0.78);
}

.player-meta {
  margin-top: 8px;
  font-size: 13px;
  color: rgba(215, 200, 167, 0.72);
}

.player-empty {
  padding: 18px;
  border: 1px solid rgba(132, 94, 44, 0.24);
  border-radius: 0;
  background: rgba(12, 13, 14, 0.42);
  color: #d7c8a7;
  text-align: center;
}

/* --- Right column: chat --- */
.chat-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid rgba(132, 94, 44, 0.26);
  border-radius: 0;
  background:
    radial-gradient(circle at 24% 0%, rgba(102, 71, 37, 0.08), transparent 18rem),
    rgba(9, 10, 11, 0.42);
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-height: 0;
}

.chat-bubble {
  display: flex;
  flex-direction: column;
  max-width: 80%;
  padding: 0.55rem 0.72rem;
  border: 1px solid rgba(132, 94, 44, 0.25);
  border-radius: 0;
  background: rgba(28, 25, 20, 0.72);
  color: #f3e4c9;
  align-self: flex-start;
  word-break: break-word;
}

.chat-bubble-own {
  align-self: flex-end;
  border-color: rgba(84, 153, 65, 0.36);
  background: rgba(24, 62, 34, 0.56);
}

.chat-sender {
  font-size: 11px;
  font-weight: 600;
  color: #c99a4b;
  margin-bottom: 2px;
}

.chat-text {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 14px;
  line-height: 1.4;
}

.chat-time {
  font-size: 10px;
  color: rgba(215, 200, 167, 0.55);
  margin-top: 2px;
  align-self: flex-end;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(215, 200, 167, 0.58);
  font-size: 13px;
}

/* Chat input row */
.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 0.68rem 0.8rem;
  border-top: 1px solid rgba(132, 94, 44, 0.25);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  padding: 0.56rem 0.72rem;
  border-radius: 0;
  border: 1px solid rgba(132, 94, 44, 0.32);
  background: rgba(5, 6, 7, 0.62);
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}

.chat-input::placeholder {
  color: rgba(215, 200, 167, 0.48);
}

.chat-input:focus {
  border-color: rgba(201, 154, 75, 0.62);
}

.chat-send {
  flex-shrink: 0;
  min-width: 5.5rem;
}

@media (max-width: 760px) {
  .player-modal-backdrop {
    padding: 0;
  }

  .player-modal-panel {
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
  }

  .player-modal-body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(9rem, 0.42fr) minmax(0, 1fr);
    padding: 0.75rem;
  }

  .player-section {
    min-height: 0;
  }
}
</style>

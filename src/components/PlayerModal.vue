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
                  <span class="player-color-dot" :style="playerColorStyle(player.color)" aria-hidden="true"></span>
                  <span class="player-name">
                    {{ player.name }}
                    <span v-if="isCurrentPlayer(player.id)" class="player-you">(you)</span>
                  </span>
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
                :class="{ 'chat-bubble-own': msg.isOwnMessage }"
                :style="chatBubbleStyle(msg)"
              >
                <span class="chat-meta">
                  <span class="chat-sender">{{ msg.isOwnMessage ? 'You' : msg.playerName }}</span>
                  <span class="chat-time">{{ formatTime(msg.timestamp) }}</span>
                </span>
                <span class="chat-text">{{ msg.message }}</span>
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
import { getConnectedPlayers, getPlayerColor } from '../store/playerStore';
import { getChatMessages, getIsPlayerModalOpen, recordOutgoingChatMessage, setPlayerModalOpen, type ChatMessage as LocalChatMessage } from '../store/chatStore';
import { closeWindow, isWindowActive, WINDOW_IDS } from '../core/windowManager';
import { currentPlayerId, sendMessage } from '../core/socket';
import PanelActionButton from './ui/PanelActionButton.vue';
import PanelModalShell from './ui/PanelModalShell.vue';
import { closeToolbarPanel } from '../store/toolbarPanelStore';

const isOpen = computed(() => getIsPlayerModalOpen.value);
const players = computed(() => getConnectedPlayers.value);
const messages = computed(() => getChatMessages.value);

const newMessage = ref('');
const chatMessagesEl = ref<HTMLElement | null>(null);
const chatInputEl = ref<HTMLInputElement | null>(null);

function isCurrentPlayer(playerId: string) {
  return playerId === currentPlayerId.value;
}

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function chatBubbleStyle(message: LocalChatMessage) {
  const color = getPlayerColor(message.playerId);
  if (!color) {
    return undefined;
  }

  return {
    '--chat-player-color': color,
  };
}

function playerColorStyle(color: string | null | undefined) {
  if (!color) {
    return undefined;
  }

  return {
    '--player-color': color,
  };
}

function sendChat() {
  const text = newMessage.value.trim();
  if (!text) return;

  const myId = currentPlayerId.value;
  const me = players.value.find((p) => p.id === myId);
  const playerId = myId ?? 'unknown';

  recordOutgoingChatMessage({
    playerId,
    message: text,
  });

  sendMessage({
    type: 'chat:message',
    playerId,
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
  closeToolbarPanel('chat');
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
  gap: 9px;
}

.player-color-dot {
  flex: 0 0 auto;
  width: 0.68rem;
  height: 0.68rem;
  border: 1px solid color-mix(in srgb, var(--player-color, #c99a4b) 72%, #fff0d2);
  border-radius: 999px;
  background: var(--player-color, #c99a4b);
  box-shadow:
    0 0 0 2px rgba(4, 5, 5, 0.72),
    0 0 8px color-mix(in srgb, var(--player-color, #c99a4b) 36%, transparent);
}

.player-name {
  min-width: 0;
  flex: 1;
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-you {
  font-weight: 400;
  font-size: 12px;
  color: rgba(201, 154, 75, 0.78);
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
  border: 1px solid rgba(143, 103, 54, 0.34);
  border-radius: 0;
  background:
    radial-gradient(circle at 24% 0%, rgba(102, 71, 37, 0.1), transparent 18rem),
    linear-gradient(180deg, rgba(13, 16, 17, 0.72), rgba(7, 8, 9, 0.84));
  box-shadow:
    inset 0 0 24px rgba(0, 0, 0, 0.46),
    inset 0 1px 0 rgba(255, 226, 161, 0.035);
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.95rem;
  display: flex;
  flex-direction: column;
  gap: 0.62rem;
  min-height: 0;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, rgba(255, 230, 170, 0.018), transparent 7rem);
}

.chat-bubble {
  display: flex;
  flex-direction: column;
  width: fit-content;
  min-width: min(12rem, 100%);
  max-width: min(86%, 32rem);
  padding: 0.58rem 0.72rem 0.66rem 0.86rem;
  border: 1px solid rgba(135, 101, 60, 0.34);
  border-left: 3px solid color-mix(in srgb, var(--chat-player-color, #c99a4b) 62%, #c99a4b);
  border-radius: 3px;
  background:
    linear-gradient(180deg, rgba(31, 30, 25, 0.92), rgba(14, 17, 17, 0.9)),
    rgba(10, 11, 11, 0.86);
  color: #f4e8cf;
  align-self: flex-start;
  word-break: break-word;
  overflow-wrap: anywhere;
  box-shadow:
    inset 0 1px 0 rgba(255, 238, 177, 0.055),
    inset 0 -1px 0 rgba(0, 0, 0, 0.52),
    0 6px 16px rgba(0, 0, 0, 0.16);
}

.chat-bubble-own {
  align-self: flex-end;
  padding-right: 0.86rem;
  padding-left: 0.72rem;
  border-color: color-mix(in srgb, var(--chat-player-color, #b0974d) 28%, rgba(137, 129, 80, 0.36));
  border-right: 3px solid color-mix(in srgb, var(--chat-player-color, #b0974d) 46%, #b0974d);
  border-left-width: 1px;
  background:
    linear-gradient(180deg, rgba(31, 34, 25, 0.94), rgba(15, 17, 14, 0.92)),
    rgba(10, 12, 10, 0.88);
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 168, 0.055),
    inset 0 -1px 0 rgba(0, 0, 0, 0.52),
    0 6px 16px rgba(0, 0, 0, 0.16);
}

.chat-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.28rem;
}

.chat-sender {
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--chat-player-color, #d8ab62) 54%, #d8ab62);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.85);
  text-transform: uppercase;
  white-space: nowrap;
}

.chat-bubble-own .chat-sender {
  color: color-mix(in srgb, var(--chat-player-color, #c9b16e) 42%, #c9b16e);
}

.chat-text {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.48;
  white-space: pre-wrap;
}

.chat-time {
  flex: 0 0 auto;
  color: rgba(215, 200, 167, 0.58);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.2;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  border: 1px dashed rgba(132, 94, 44, 0.24);
  background: rgba(8, 10, 11, 0.34);
  color: rgba(215, 200, 167, 0.58);
  font-size: 13px;
  text-align: center;
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

  .chat-bubble {
    max-width: 94%;
  }
}
</style>

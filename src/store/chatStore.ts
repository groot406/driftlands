import { ref, computed } from 'vue';

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  isOwnMessage: boolean;
  timestamp: number;
}

// Chat state
const chatMessages = ref<ChatMessage[]>([]);
const isPlayerModalOpen = ref(false);
const unreadChatCount = ref(0);
const outgoingChatEchoes: Array<{ playerId: string; message: string; sentAt: number }> = [];
const OUTGOING_CHAT_ECHO_WINDOW_MS = 15_000;

// Computed values
export const getChatMessages = computed(() => chatMessages.value);
export const getIsPlayerModalOpen = computed(() => isPlayerModalOpen.value);
export const getUnreadChatCount = computed(() => unreadChatCount.value);

// Actions
export function addChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>, options: { unread?: boolean } = {}) {
  const chatMessage: ChatMessage = {
    ...message,
    id: crypto.randomUUID(),
    timestamp: Date.now()
  };
  chatMessages.value.push(chatMessage);
  if (options.unread) {
    unreadChatCount.value++;
  }
}

export function recordOutgoingChatMessage(message: { playerId: string; message: string }) {
  outgoingChatEchoes.push({
    playerId: message.playerId,
    message: message.message,
    sentAt: Date.now(),
  });
  pruneOutgoingChatEchoes();
}

export function consumeOutgoingChatEcho(message: { playerId: string; message: string }) {
  pruneOutgoingChatEchoes();
  const matchIndex = outgoingChatEchoes.findIndex((entry) => (
    entry.playerId === message.playerId
    && entry.message === message.message
  ));

  if (matchIndex === -1) {
    return false;
  }

  outgoingChatEchoes.splice(matchIndex, 1);
  return true;
}

function pruneOutgoingChatEchoes() {
  const cutoff = Date.now() - OUTGOING_CHAT_ECHO_WINDOW_MS;
  for (let index = outgoingChatEchoes.length - 1; index >= 0; index--) {
    if (outgoingChatEchoes[index]!.sentAt < cutoff) {
      outgoingChatEchoes.splice(index, 1);
    }
  }
}

export function clearChatMessages() {
  chatMessages.value = [];
  unreadChatCount.value = 0;
  outgoingChatEchoes.splice(0);
}

export function markChatMessagesRead() {
  unreadChatCount.value = 0;
}

export function setPlayerModalOpen(open: boolean) {
  isPlayerModalOpen.value = open;
  if (open) {
    markChatMessagesRead();
  }
}

export function togglePlayerModal() {
  isPlayerModalOpen.value = !isPlayerModalOpen.value;
  if (isPlayerModalOpen.value) {
    markChatMessagesRead();
  }
}

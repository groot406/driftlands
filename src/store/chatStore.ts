import { ref, computed } from 'vue';

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
}

// Chat state
const chatMessages = ref<ChatMessage[]>([]);
const isPlayerModalOpen = ref(false);

// Computed values
export const getChatMessages = computed(() => chatMessages.value);
export const getIsPlayerModalOpen = computed(() => isPlayerModalOpen.value);

// Actions
export function addChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>) {
  const chatMessage: ChatMessage = {
    ...message,
    id: crypto.randomUUID(),
    timestamp: Date.now()
  };
  chatMessages.value.push(chatMessage);
}

export function clearChatMessages() {
  chatMessages.value = [];
}

export function setPlayerModalOpen(open: boolean) {
  isPlayerModalOpen.value = open;
}

export function togglePlayerModal() {
  isPlayerModalOpen.value = !isPlayerModalOpen.value;
}

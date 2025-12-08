import { ref, computed } from 'vue';

// Online players state
const onlinePlayersCount = ref(0);
const connectedPlayers = ref<Array<{ id: string, name: string }>>([]);

// Computed values
export const getOnlinePlayersCount = computed(() => onlinePlayersCount.value);
export const getConnectedPlayers = computed(() => connectedPlayers.value);

// Actions
export function updateOnlinePlayersCount(count: number) {
  onlinePlayersCount.value = count;
}

export function addPlayer(player: { id: string, name: string }) {
  const existingIndex = connectedPlayers.value.findIndex(p => p.id === player.id);
  if (existingIndex === -1) {
    connectedPlayers.value.push(player);
    onlinePlayersCount.value = connectedPlayers.value.length;
  }
}

export function removePlayer(playerId: string) {
  const index = connectedPlayers.value.findIndex(p => p.id === playerId);
  if (index !== -1) {
    connectedPlayers.value.splice(index, 1);
    onlinePlayersCount.value = connectedPlayers.value.length;
  }
}

export function clearAllPlayers() {
  connectedPlayers.value = [];
  onlinePlayersCount.value = 0;
}

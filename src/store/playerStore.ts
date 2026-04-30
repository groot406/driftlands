import { computed, ref } from 'vue';
import type { CoopPingSnapshot, CoopPlayerSnapshot, CoopStateSnapshot } from '../shared/coop/types';
import type { PlayerEntitySnapshot } from '../shared/multiplayer/player';
import {getHero, heroes} from "./heroStore.ts";

export interface ConnectedPlayer extends CoopPlayerSnapshot {}

const onlinePlayersCount = ref(0);
const connectedPlayers = ref<ConnectedPlayer[]>([]);
const playerEntities = ref<PlayerEntitySnapshot[]>([]);
const heroClaims = ref<Record<string, string>>({});
const activeCoopPings = ref<CoopPingSnapshot[]>([]);

function clonePlayer(player: ConnectedPlayer): ConnectedPlayer {
  return {
    ...player,
    claimedHeroIds: player.claimedHeroIds.slice(),
  };
}

function rebuildHeroClaims(players: ConnectedPlayer[]) {
  const nextClaims: Record<string, string> = {};

  for (const player of players) {
    for (const heroId of player.claimedHeroIds) {
      nextClaims[heroId] = player.id;
    }
  }

  return nextClaims;
}

function removeCoopPing(pingId: string) {
  const next = activeCoopPings.value.filter((ping) => ping.id !== pingId);
  if (next.length !== activeCoopPings.value.length) {
    activeCoopPings.value = next;
  }
}

export const getOnlinePlayersCount = computed(() => onlinePlayersCount.value);
export const getConnectedPlayers = computed(() => connectedPlayers.value);
export const getPlayerEntities = computed(() => playerEntities.value);
export const getReadyPlayersCount = computed(() => connectedPlayers.value.filter((player) => player.ready).length);
export const getHeroClaimMap = computed(() => heroClaims.value);
export const getActiveCoopPings = computed(() => activeCoopPings.value);

export function updateOnlinePlayersCount(count: number) {
  onlinePlayersCount.value = count;
}

export function replacePartyState(state: CoopStateSnapshot) {
  const players = state.players.map((player) => clonePlayer(player));
  connectedPlayers.value = players;
  heroClaims.value = rebuildHeroClaims(players);
  onlinePlayersCount.value = state.onlineCount;
}

export function replacePlayerEntities(players: PlayerEntitySnapshot[]) {
  playerEntities.value = players.map((player) => ({ ...player }));
}

export function addPlayer(player: { id: string, name: string, color?: string, settlementId?: string | null }) {
  const existingIndex = connectedPlayers.value.findIndex((entry) => entry.id === player.id);
  if (existingIndex === -1) {
    connectedPlayers.value.push({
      id: player.id,
      name: player.name,
      color: player.color,
      settlementId: player.settlementId ?? null,
      ready: false,
      connectedAt: Date.now(),
      claimedHeroIds: [],
    });
  } else {
    connectedPlayers.value[existingIndex] = {
      ...connectedPlayers.value[existingIndex]!,
      name: player.name,
      color: player.color ?? connectedPlayers.value[existingIndex]!.color,
      settlementId: player.settlementId ?? connectedPlayers.value[existingIndex]!.settlementId ?? null,
    };
  }

  heroClaims.value = rebuildHeroClaims(connectedPlayers.value);
  onlinePlayersCount.value = connectedPlayers.value.length;
}

export function removePlayer(playerId: string) {
  const nextPlayers = connectedPlayers.value.filter((player) => player.id !== playerId);
  connectedPlayers.value = nextPlayers;
  heroClaims.value = rebuildHeroClaims(nextPlayers);
  onlinePlayersCount.value = nextPlayers.length;
}

export function clearAllPlayers() {
  connectedPlayers.value = [];
  playerEntities.value = [];
  heroClaims.value = {};
  activeCoopPings.value = [];
  onlinePlayersCount.value = 0;
}

export function getPlayerEntityById(playerId: string | null | undefined): PlayerEntitySnapshot | null {
  if (!playerId) {
    return null;
  }

  return playerEntities.value.find((player) => player.id === playerId) ?? null;
}

export function getPlayerColor(playerId: string | null | undefined): string | null {
  return getPlayerEntityById(playerId)?.color
    ?? connectedPlayers.value.find((player) => player.id === playerId)?.color
    ?? null;
}

export function getPlayerById(playerId: string | null | undefined): ConnectedPlayer | null {
  if (!playerId) {
    return null;
  }

  return connectedPlayers.value.find((player) => player.id === playerId) ?? null;
}

export function getHeroOwnerId(heroId: string): string | null {
  return heroClaims.value[heroId] ?? null;
}

export function getHeroOwner(heroId: string): ConnectedPlayer | null {
  return getPlayerById(getHeroOwnerId(heroId));
}

export function getHeroOwnerName(heroId: string): string | null {
  return getHeroOwner(heroId)?.name ?? null;
}

export function canControlHero(heroId: string, currentPlayerId: string | null | undefined) {
  const ownerId = getHero(heroId)?.playerId;
  return !ownerId || ownerId === currentPlayerId;
}

export function isHeroClaimedByCurrentPlayer(heroId: string, currentPlayerId: string | null | undefined) {
  return getHeroOwnerId(heroId) === currentPlayerId;
}

export function isHeroClaimedByOtherPlayer(heroId: string, currentPlayerId: string | null | undefined) {
  const ownerId = getHeroOwnerId(heroId);
  return !!ownerId && ownerId !== currentPlayerId;
}

export function addCoopPing(ping: CoopPingSnapshot) {
  activeCoopPings.value = [
    ...activeCoopPings.value.filter((entry) => entry.id !== ping.id && entry.expiresAt > Date.now()),
    ping,
  ];

  const timeoutMs = Math.max(0, ping.expiresAt - Date.now());
  window.setTimeout(() => {
    removeCoopPing(ping.id);
  }, timeoutMs + 50);
}

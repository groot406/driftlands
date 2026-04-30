import { computed, ref } from 'vue';
import type { Tile } from '../core/types/Tile.ts';
import {
  isPositionControlledBySettlement,
  isTileControlledBySettlement,
} from './settlementSupportStore.ts';
import type { SettlementStartCandidate, SettlementStartMarker, SettlementStartTerrainTile } from '../shared/multiplayer/settlementStart.ts';
import { setActiveStorySettlement } from '../shared/story/progressionState.ts';

export const settlementStartCandidates = ref<SettlementStartCandidate[]>([]);
export const settlementStartMarkers = ref<SettlementStartMarker[]>([]);
export const settlementStartTerrainTiles = ref<SettlementStartTerrainTile[]>([]);
export const currentPlayerSettlementId = ref<string | null>(null);
export const currentPlayerReachColor = ref<string | null>(null);
export const settlementStartError = ref<string | null>(null);
export const settlementStartFoundingCandidateId = ref<string | null>(null);

export const availableSettlementStartCandidates = computed(() => settlementStartCandidates.value.filter((candidate) => candidate.available));
export const needsSettlementStart = computed(() => !currentPlayerSettlementId.value && availableSettlementStartCandidates.value.length > 0);

export function replaceSettlementStartOptions(options: {
  currentSettlementId: string | null;
  candidates: SettlementStartCandidate[];
  settlements: SettlementStartMarker[];
  terrainTiles?: SettlementStartTerrainTile[];
}) {
  currentPlayerSettlementId.value = options.currentSettlementId;
  setActiveStorySettlement(options.currentSettlementId);
  settlementStartCandidates.value = options.candidates.map((candidate) => ({ ...candidate }));
  settlementStartMarkers.value = options.settlements.map((settlement) => ({ ...settlement }));
  settlementStartTerrainTiles.value = options.terrainTiles?.map((tile) => ({ ...tile })) ?? [];
  currentPlayerReachColor.value = options.settlements.find((settlement) => settlement.settlementId === options.currentSettlementId)?.playerColor ?? null;

  if (options.currentSettlementId) {
    settlementStartFoundingCandidateId.value = null;
    settlementStartError.value = null;
  }
}

export function upsertSettlementStartMarker(marker: SettlementStartMarker) {
  const index = settlementStartMarkers.value.findIndex((settlement) => settlement.settlementId === marker.settlementId);
  const previous = index >= 0 ? settlementStartMarkers.value[index] : null;
  const next: SettlementStartMarker = {
    ...previous,
    ...marker,
    playerColor: marker.playerColor ?? previous?.playerColor ?? null,
    playerId: marker.playerId ?? previous?.playerId ?? null,
    playerName: marker.playerName ?? previous?.playerName ?? null,
  };

  if (index >= 0) {
    settlementStartMarkers.value.splice(index, 1, next);
  } else {
    settlementStartMarkers.value.push(next);
    settlementStartMarkers.value.sort((left, right) => left.settlementId.localeCompare(right.settlementId));
  }

  if (currentPlayerSettlementId.value === marker.settlementId) {
    currentPlayerReachColor.value = next.playerColor ?? currentPlayerReachColor.value;
  }
}

export function markSettlementStartFounding(candidateId: string) {
  settlementStartFoundingCandidateId.value = candidateId;
  settlementStartError.value = null;
}

export function applySettlementFoundResult(result: {
  success: boolean;
  settlementId: string | null;
  message: string;
}) {
  settlementStartFoundingCandidateId.value = null;
  if (result.success) {
    currentPlayerSettlementId.value = result.settlementId;
    setActiveStorySettlement(result.settlementId);
    currentPlayerReachColor.value = settlementStartMarkers.value.find((settlement) => settlement.settlementId === result.settlementId)?.playerColor ?? currentPlayerReachColor.value;
    settlementStartError.value = null;
    return;
  }

  settlementStartError.value = result.message;
}

export function isPositionInCurrentPlayerTerritory(q: number, r: number) {
  return isPositionControlledBySettlement(q, r, currentPlayerSettlementId.value);
}

export function isTileInCurrentPlayerTerritory(tile: Tile | null | undefined) {
  return isTileControlledBySettlement(tile, currentPlayerSettlementId.value);
}

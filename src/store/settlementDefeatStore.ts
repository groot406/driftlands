import { computed, ref } from 'vue';
import type { LeaderboardEntry, SeasonSnapshot } from '../shared/seasons/types.ts';
import { addNotification } from './notificationStore.ts';
import { playInterfaceSound } from './soundStore.ts';
import { triggerWarningHaptic } from '../core/hapticsService.ts';

export interface SettlementDefeatAnnouncement {
  id: string;
  seasonId: string;
  defeatedPlayerId: string;
  defeatedPlayerName: string;
  defeatedPlayerColor?: string | null;
  defeatedSettlementId: string;
  defeatedAt: number;
  defeatedBySettlementId: string;
  defeatedByPlayerId?: string | null;
  defeatedByPlayerName?: string | null;
  capturedTownCenterTileId: string;
  transferredTileCount: number;
  finalRank: number;
  finalScore: number;
}

const defeatQueue = ref<SettlementDefeatAnnouncement[]>([]);
const seenDefeatIds = new Set<string>();

export const activeSettlementDefeat = computed(() => defeatQueue.value[0] ?? null);

function defeatId(seasonId: string, entry: LeaderboardEntry) {
  return `${seasonId}:${entry.settlementId}:${entry.defeatedAt ?? 0}`;
}

function buildAnnouncement(seasonId: string, entry: LeaderboardEntry): SettlementDefeatAnnouncement | null {
  if (!entry.defeated || !entry.defeatedAt || !entry.defeatedBySettlementId || !entry.capturedTownCenterTileId) {
    return null;
  }

  return {
    id: defeatId(seasonId, entry),
    seasonId,
    defeatedPlayerId: entry.playerId,
    defeatedPlayerName: entry.playerName,
    defeatedPlayerColor: entry.playerColor,
    defeatedSettlementId: entry.settlementId,
    defeatedAt: entry.defeatedAt,
    defeatedBySettlementId: entry.defeatedBySettlementId,
    defeatedByPlayerId: entry.defeatedByPlayerId ?? null,
    defeatedByPlayerName: entry.defeatedByPlayerName ?? null,
    capturedTownCenterTileId: entry.capturedTownCenterTileId,
    transferredTileCount: Math.max(0, entry.transferredTileCount ?? 0),
    finalRank: entry.rank,
    finalScore: entry.score,
  };
}

function emitDefeatEffects(announcement: SettlementDefeatAnnouncement) {
  addNotification({
    type: 'defeat',
    title: `${announcement.defeatedPlayerName} defeated`,
    message: `${announcement.defeatedByPlayerName ?? 'A rival'} captured the last town center.`,
    duration: 8_000,
  });
  triggerWarningHaptic(true);
  void playInterfaceSound('success.mp3', { baseVolume: 0.58 });
}

export function queueSettlementDefeatAnnouncements(
  previous: SeasonSnapshot | null | undefined,
  next: SeasonSnapshot | null | undefined,
  options?: { emitEffects?: boolean },
) {
  if (!previous || !next || previous.seasonId !== next.seasonId) {
    return;
  }

  const previousDefeated = new Set(
    previous.leaderboard
      .filter((entry) => entry.defeated)
      .map((entry) => entry.settlementId),
  );
  const emitEffects = options?.emitEffects !== false;

  for (const entry of next.leaderboard) {
    if (!entry.defeated || previousDefeated.has(entry.settlementId)) {
      continue;
    }

    const announcement = buildAnnouncement(next.seasonId, entry);
    if (!announcement || seenDefeatIds.has(announcement.id)) {
      continue;
    }

    seenDefeatIds.add(announcement.id);
    defeatQueue.value = [...defeatQueue.value, announcement];
    if (emitEffects) {
      emitDefeatEffects(announcement);
    }
  }
}

export function dismissSettlementDefeat() {
  defeatQueue.value = defeatQueue.value.slice(1);
}

export function resetSettlementDefeats() {
  defeatQueue.value = [];
  seenDefeatIds.clear();
}

import type { TickContext } from '../tick.ts';
import { broadcast } from '../messages/messageRouter.ts';
import { competitionState } from '../state/competitionState.ts';
import { seasonState } from '../state/seasonState.ts';
import type { CompetitionUpdateMessage } from '../../../src/shared/protocol.ts';

const SAVE_INTERVAL_MS = 10_000;
const BROADCAST_INTERVAL_MS = 5_000;

let lastSaveAt = 0;
let lastBroadcastAt = 0;
let lastBroadcastKey = '';

function buildBroadcastKey() {
  const snapshot = competitionState.getSnapshot();
  return JSON.stringify({
    currentSeasonId: snapshot.currentSeasonId,
    processedSeasonIds: snapshot.processedSeasonIds,
    overall: snapshot.leaderboards.overall.slice(0, 10).map((entry) => [entry.playerId, entry.value, entry.secondaryValue]),
    hours: snapshot.leaderboards.hours.slice(0, 10).map((entry) => [entry.playerId, entry.value]),
    settlements: snapshot.settlements.slice(0, 10).map((entry) => [entry.id, entry.score]),
    badges: snapshot.badges.slice(0, 20).map((entry) => [entry.id, entry.awardedAt]),
  });
}

function broadcastCompetitionUpdate() {
  broadcast({
    type: 'competition:update',
    competition: competitionState.getSnapshot(),
    timestamp: Date.now(),
  } satisfies CompetitionUpdateMessage);
}

export function broadcastCompetitionSnapshot() {
  broadcastCompetitionUpdate();
  lastBroadcastKey = buildBroadcastKey();
  lastBroadcastAt = Date.now();
}

export const competitionSystem = {
  name: 'competition',
  intervalMs: 1_000,
  tick: (ctx: TickContext) => {
    const season = seasonState.getSnapshot();
    if (season?.status === 'completed') {
      competitionState.processCompletedSeason(season);
    } else {
      competitionState.syncLiveSeason(season);
    }

    competitionState.flushActiveSessions(ctx.now);

    if (ctx.now - lastSaveAt >= SAVE_INTERVAL_MS) {
      competitionState.saveIfDirty('competition-system');
      lastSaveAt = ctx.now;
    }

    if (ctx.now - lastBroadcastAt >= BROADCAST_INTERVAL_MS) {
      const key = buildBroadcastKey();
      if (key !== lastBroadcastKey) {
        broadcastCompetitionUpdate();
        lastBroadcastKey = key;
      }
      lastBroadcastAt = ctx.now;
    }
  },
};

import type { TickContext } from '../tick';
import { tickEngine } from '../tick';
import { seasonState } from '../state/seasonState';
import { worldState } from '../worldState';
import { broadcast } from '../messages/messageRouter';
import { serverDebugModeEnabled, spawnSafetyEnabled } from '../config/serverMode';
import { playerSettlementState } from '../state/playerSettlementState';
import { coopState } from '../state/coopState';
import { ServerSettlementStartHandler } from '../handlers/settlementStartHandler';
import type { CoopSnapshotMessage, PlayerSnapshotMessage, SeasonSnapshotMessage, WorldSnapshotMessage } from '../../../src/shared/protocol';

const DEFAULT_SEASON_RESTART_DELAY_MS = 10 * 60_000;

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

function parseMsEnv(value: string | undefined, fallback: number) {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

const seasonAutoRestartEnabled = parseBooleanEnv(process.env.DRIFTLANDS_SEASON_AUTO_RESTART, true);
const seasonRestartDelayMs = parseMsEnv(process.env.DRIFTLANDS_SEASON_RESTART_DELAY_MS, DEFAULT_SEASON_RESTART_DELAY_MS);
const defaultServerTps = Math.max(1, Math.min(120, Math.floor(Number(process.env.SERVER_TPS ?? 10) || 10)));

let restartInFlight = false;
let appliedServerTps = defaultServerTps;

function broadcastWorldSnapshot() {
  broadcast({
    type: 'world:snapshot',
    ...worldState.getSnapshot(),
    debugModeEnabled: serverDebugModeEnabled,
    spawnSafetyEnabled,
    timestamp: Date.now(),
  } satisfies WorldSnapshotMessage);
}

function broadcastPlayerSnapshot() {
  broadcast({
    type: 'player:snapshot',
    currentPlayerId: null,
    players: playerSettlementState.listPlayers(),
    timestamp: Date.now(),
  } satisfies PlayerSnapshotMessage);
}

function broadcastCoopSnapshot() {
  broadcast({
    type: 'coop:snapshot',
    state: coopState.getSnapshot(),
    timestamp: Date.now(),
  } satisfies CoopSnapshotMessage);
}

function broadcastSeasonSnapshot() {
  const season = seasonState.getSnapshot();
  if (!season) {
    return;
  }
  broadcast({
    type: 'season:snapshot',
    season,
    timestamp: Date.now(),
  } satisfies SeasonSnapshotMessage);
}

async function restartSeasonWorld() {
  if (restartInFlight) {
    return;
  }

  restartInFlight = true;
  try {
    playerSettlementState.clearAssignments();
    coopState.resetHeroClaims();
    await worldState.init();
    broadcastWorldSnapshot();
    broadcastSeasonSnapshot();
    broadcastPlayerSnapshot();
    broadcastCoopSnapshot();
    ServerSettlementStartHandler.broadcastStartOptionsToConnectedPlayers();
  } catch (error) {
    console.error('[season] automatic season restart failed', error);
  } finally {
    restartInFlight = false;
  }
}

export const seasonSystem = {
  name: 'season',
  intervalMs: 1_000,
  tick: (ctx: TickContext) => {
    seasonState.tick(ctx.now);
    const stageTps = seasonState.getCurrentStageConfig()?.gameplay?.serverTickRate;
    const nextTps = Math.max(1, Math.min(120, Math.floor(Number(stageTps ?? defaultServerTps) || defaultServerTps)));
    if (nextTps !== appliedServerTps) {
      appliedServerTps = nextTps;
      tickEngine.setTPS(nextTps);
    }
    const snapshot = seasonState.getSnapshot();
    if (!seasonAutoRestartEnabled || !snapshot || snapshot.status !== 'completed') {
      return;
    }

    const startsAt = snapshot.nextSeasonStartsAt ?? (ctx.now + seasonRestartDelayMs);
    if (snapshot.nextSeasonStartsAt == null) {
      seasonState.scheduleNextSeason(startsAt);
    }

    if (ctx.now >= startsAt) {
      void restartSeasonWorld();
    }
  },
};

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { BaseMessage } from '../../../src/shared/protocol';
import type { GameplayEvent } from '../../../src/shared/gameplay/events';

export type AnalyticsRange = 'today' | '7d' | '30d';
export type AnalyticsClientEventName = 'panel:open' | 'panel:close' | 'ui:action';

export interface AnalyticsClientEventMessage extends BaseMessage {
  type: 'analytics:client_event';
  event: AnalyticsClientEventName;
  name: string;
  at: number;
  metadata?: Record<string, string | number | boolean | null>;
}

interface PanelAggregate {
  opens: number;
  totalOpenMs: number;
}

interface DailyAnalyticsRecord {
  date: string;
  uniquePlayerHashes: string[];
  sessionsStarted: number;
  playMs: number;
  settlementsFounded: number;
  worldRestarts: number;
  seasonRestarts: number;
  actions: Record<string, number>;
  panels: Record<string, PanelAggregate>;
}

export interface GameAnalyticsStats {
  range: AnalyticsRange;
  generatedAt: string;
  current: {
    connectedSockets: number;
    connectedPlayers: number;
  };
  totals: {
    uniquePlayers: number;
    sessionsStarted: number;
    playMs: number;
    settlementsFounded: number;
    worldRestarts: number;
    seasonRestarts: number;
  };
  actions: Record<string, number>;
  panels: Record<string, PanelAggregate>;
  topActions: Array<{ name: string; count: number }>;
  topPanels: Array<{ name: string; opens: number; totalOpenMs: number }>;
  daily: Array<{
    date: string;
    uniquePlayers: number;
    sessionsStarted: number;
    playMs: number;
    settlementsFounded: number;
    worldRestarts: number;
    seasonRestarts: number;
    actions: Record<string, number>;
    panels: Record<string, PanelAggregate>;
  }>;
}

interface ActiveSession {
  playerHash: string;
  lastFlushedAt: number;
}

interface ActivePanel {
  panelName: string;
  openedAt: number;
}

interface GameAnalyticsOptions {
  analyticsPath?: string;
  retentionDays?: number;
  salt?: string;
  now?: () => number;
}

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_ANALYTICS_PATH = '.driftlands/analytics';
const DAY_MS = 24 * 60 * 60 * 1000;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveAnalyticsPath(configured?: string) {
  const value = configured ?? process.env.DRIFTLANDS_ANALYTICS_PATH;
  return resolve(process.cwd(), value?.trim() || DEFAULT_ANALYTICS_PATH);
}

function createDefaultSalt() {
  return process.env.DRIFTLANDS_ANALYTICS_SALT
    || 'driftlands-local-analytics';
}

function dayKey(at: number) {
  return new Date(at).toISOString().slice(0, 10);
}

function dayStartMs(date: string) {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, (month ?? 1) - 1, day ?? 1);
}

function addDays(date: string, days: number) {
  return dayKey(dayStartMs(date) + days * DAY_MS);
}

function createEmptyRecord(date: string): DailyAnalyticsRecord {
  return {
    date,
    uniquePlayerHashes: [],
    sessionsStarted: 0,
    playMs: 0,
    settlementsFounded: 0,
    worldRestarts: 0,
    seasonRestarts: 0,
    actions: {},
    panels: {},
  };
}

function normalizeRecord(input: Partial<DailyAnalyticsRecord> | null | undefined, date: string): DailyAnalyticsRecord {
  const record = createEmptyRecord(date);
  record.uniquePlayerHashes = Array.isArray(input?.uniquePlayerHashes)
    ? Array.from(new Set(input.uniquePlayerHashes.filter((value): value is string => typeof value === 'string')))
    : [];
  record.sessionsStarted = normalizeCount(input?.sessionsStarted);
  record.playMs = normalizeCount(input?.playMs);
  record.settlementsFounded = normalizeCount(input?.settlementsFounded);
  record.worldRestarts = normalizeCount(input?.worldRestarts);
  record.seasonRestarts = normalizeCount(input?.seasonRestarts);
  record.actions = normalizeCounterMap(input?.actions);
  record.panels = normalizePanelMap(input?.panels);
  return record;
}

function normalizeCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeCounterMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const output: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof key === 'string' && typeof value === 'number' && Number.isFinite(value) && value > 0) {
      output[key] = Math.floor(value);
    }
  }
  return output;
}

function normalizePanelMap(input: unknown): Record<string, PanelAggregate> {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const output: Record<string, PanelAggregate> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const aggregate = value as Partial<PanelAggregate>;
    output[key] = {
      opens: normalizeCount(aggregate.opens),
      totalOpenMs: normalizeCount(aggregate.totalOpenMs),
    };
  }
  return output;
}

function increment(map: Record<string, number>, key: string, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function addPanelOpen(map: Record<string, PanelAggregate>, key: string) {
  const aggregate = map[key] ?? { opens: 0, totalOpenMs: 0 };
  aggregate.opens += 1;
  map[key] = aggregate;
}

function addPanelDuration(map: Record<string, PanelAggregate>, key: string, durationMs: number) {
  const aggregate = map[key] ?? { opens: 0, totalOpenMs: 0 };
  aggregate.totalOpenMs += Math.max(0, Math.floor(durationMs));
  map[key] = aggregate;
}

function cloneCounters(map: Record<string, number>) {
  return Object.fromEntries(Object.entries(map).sort(([left], [right]) => left.localeCompare(right)));
}

function clonePanels(map: Record<string, PanelAggregate>) {
  return Object.fromEntries(
    Object.entries(map)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, { opens: value.opens, totalOpenMs: value.totalOpenMs }]),
  );
}

function sanitizeActionKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function sanitizePanelName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function messageActionKey(message: BaseMessage) {
  switch (message.type) {
    case 'player:join':
    case 'player:leave':
    case 'analytics:client_event':
      return null;
    case 'hero:move_request':
      return 'hero_move';
    case 'task:request_start':
      return `task_start_${sanitizeActionKey(String((message as { task?: unknown }).task ?? 'unknown'))}`;
    case 'task:request_join':
      return 'task_join';
    case 'task:request_leave':
      return 'task_leave';
    case 'task:request_cancel':
      return 'task_cancel';
    case 'hero:scout_resource_request':
      return `hero_scout_${sanitizeActionKey(String((message as { resourceType?: unknown }).resourceType ?? 'resource'))}`;
    case 'hero:ability_use':
      return `hero_ability_${sanitizeActionKey(String((message as { ability?: unknown }).ability ?? 'use'))}`;
    case 'hero:skill_select':
      return `hero_skill_${sanitizeActionKey(String((message as { skill?: unknown }).skill ?? 'select'))}`;
    case 'chat:message':
      return 'chat_message';
    case 'coop:hero_claim':
      return 'coop_hero_claim';
    case 'coop:hero_release':
      return 'coop_hero_release';
    case 'coop:request_ping':
      return `coop_ping_${sanitizeActionKey(String((message as { kind?: unknown }).kind ?? 'unknown'))}`;
    case 'settlement:found_request':
      return 'settlement_found_request';
    case 'jobs:set_site_enabled':
      return 'job_site_toggle';
    case 'studies:set_active':
      return `study_set_active_${sanitizeActionKey(String((message as { studyKey?: unknown }).studyKey ?? 'unknown'))}`;
    case 'settlement:set_border_mode':
      return `settlement_border_${sanitizeActionKey(String((message as { borderMode?: unknown }).borderMode ?? 'unknown'))}`;
    case 'military:queue_guard_training':
      return 'military_queue_guard_training';
    case 'military:assign_guards':
      return 'military_assign_guards';
    case 'military:build_palisade':
      return 'military_build_palisade';
    case 'military:set_raid_target':
      return 'military_set_raid_target';
    case 'market:request_overview':
      return 'market_request_overview';
    case 'market:trade':
      return `market_${sanitizeActionKey(String((message as { action?: unknown }).action ?? 'trade'))}`;
    case 'ship_order:load':
      return 'ship_order_load';
    case 'world:restart':
      return 'world_restart';
    case 'season_admin:restart_now':
      return 'season_restart';
    default:
      return sanitizeActionKey(message.type);
  }
}

function gameplayActionKey(event: GameplayEvent) {
  switch (event.type) {
    case 'tile:discovered':
      return 'tile_discovered';
    case 'resource:delivered':
      return `resource_delivered_${sanitizeActionKey(event.resourceType)}`;
    case 'task:completed':
      return `task_completed_${sanitizeActionKey(event.taskType)}`;
    case 'study:completed':
      return `study_completed_${sanitizeActionKey(event.studyKey)}`;
    case 'tile:restored':
      return 'tile_restored';
    case 'population:changed':
      return 'population_changed';
    case 'military:tower_captured':
      return 'military_tower_captured';
    case 'military:settlement_defeated':
      return 'military_settlement_defeated';
    case 'ship_order:completed':
      return 'ship_order_completed';
    case 'calamity:survived':
      return 'calamity_survived';
  }
}

function rangeDays(range: AnalyticsRange, now: number) {
  const today = dayKey(now);
  const count = range === 'today' ? 1 : range === '7d' ? 7 : 30;
  return Array.from({ length: count }, (_value, index) => addDays(today, index - count + 1));
}

function normalizeRange(value: unknown): AnalyticsRange {
  return value === '7d' || value === '30d' ? value : 'today';
}

export class GameAnalytics {
  private readonly analyticsPath: string;
  private readonly retentionDays: number;
  private readonly salt: string;
  private readonly now: () => number;
  private readonly records = new Map<string, DailyAnalyticsRecord>();
  private readonly activeSessions = new Map<string, ActiveSession>();
  private readonly activePanels = new Map<string, ActivePanel>();

  constructor(options: GameAnalyticsOptions = {}) {
    this.analyticsPath = resolveAnalyticsPath(options.analyticsPath);
    this.retentionDays = Math.max(1, Math.floor(options.retentionDays ?? parsePositiveInteger(process.env.DRIFTLANDS_ANALYTICS_RETENTION_DAYS, DEFAULT_RETENTION_DAYS)));
    this.salt = options.salt ?? createDefaultSalt();
    this.now = options.now ?? (() => Date.now());
    this.ensureStorage();
    this.pruneOldRecords();
  }

  recordPlayerJoin(socketId: string, playerId: string, at: number = this.now()) {
    const playerHash = this.hashPlayerId(playerId);
    const record = this.getRecord(dayKey(at));
    if (!record.uniquePlayerHashes.includes(playerHash)) {
      record.uniquePlayerHashes.push(playerHash);
      record.uniquePlayerHashes.sort();
    }
    record.sessionsStarted += 1;
    this.activeSessions.set(socketId, {
      playerHash,
      lastFlushedAt: at,
    });
    this.saveRecord(record);
  }

  recordPlayerDisconnect(socketId: string, at: number = this.now()) {
    this.flushSession(socketId, at);
    for (const key of Array.from(this.activePanels.keys())) {
      if (key.startsWith(`${socketId}:`)) {
        this.closePanel(key, at);
      }
    }
  }

  recordInboundMessage(_socketId: string, message: BaseMessage) {
    const action = messageActionKey(message);
    if (!action) {
      return;
    }

    const record = this.getRecord(dayKey(this.now()));
    increment(record.actions, action);
    this.saveRecord(record);
  }

  recordClientEvent(socketId: string, message: AnalyticsClientEventMessage) {
    const name = sanitizePanelName(message.name);
    const at = Number.isFinite(message.at) ? Math.max(0, Math.floor(message.at)) : this.now();

    if (message.event === 'panel:open') {
      const record = this.getRecord(dayKey(at));
      addPanelOpen(record.panels, name);
      this.activePanels.set(this.panelKey(socketId, name), { panelName: name, openedAt: at });
      this.saveRecord(record);
      return;
    }

    if (message.event === 'panel:close') {
      this.closePanel(this.panelKey(socketId, name), at);
      return;
    }

    const record = this.getRecord(dayKey(at));
    increment(record.actions, `ui_${sanitizeActionKey(name)}`);
    this.saveRecord(record);
  }

  recordGameplayEvent(event: GameplayEvent) {
    const record = this.getRecord(dayKey(this.now()));
    increment(record.actions, gameplayActionKey(event));
    this.saveRecord(record);
  }

  recordSettlementFounded(at: number = this.now()) {
    const record = this.getRecord(dayKey(at));
    record.settlementsFounded += 1;
    increment(record.actions, 'settlement_founded');
    this.saveRecord(record);
  }

  recordWorldRestart(at: number = this.now()) {
    const record = this.getRecord(dayKey(at));
    record.worldRestarts += 1;
    increment(record.actions, 'world_restarted');
    this.saveRecord(record);
  }

  recordSeasonRestart(at: number = this.now()) {
    const record = this.getRecord(dayKey(at));
    record.seasonRestarts += 1;
    increment(record.actions, 'season_restarted');
    this.saveRecord(record);
  }

  flushActiveSessions(at: number = this.now()) {
    for (const socketId of Array.from(this.activeSessions.keys())) {
      this.flushSession(socketId, at);
    }
    for (const key of Array.from(this.activePanels.keys())) {
      this.closePanel(key, at);
    }
  }

  getStats(rangeInput: AnalyticsRange, current: { connectedSockets: number; connectedPlayers: number }): GameAnalyticsStats {
    const range = normalizeRange(rangeInput);
    const now = this.now();
    const days = new Set(rangeDays(range, now));
    const records = Array.from(days).map((date) => this.cloneRecord(this.getRecord(date)));
    this.overlayActiveSessionDurations(records, days, now);
    this.overlayActivePanelDurations(records, days, now);

    const uniquePlayers = new Set<string>();
    const totals = {
      uniquePlayers: 0,
      sessionsStarted: 0,
      playMs: 0,
      settlementsFounded: 0,
      worldRestarts: 0,
      seasonRestarts: 0,
    };
    const actions: Record<string, number> = {};
    const panels: Record<string, PanelAggregate> = {};

    const daily = records.map((record) => {
      for (const playerHash of record.uniquePlayerHashes) {
        uniquePlayers.add(playerHash);
      }
      totals.sessionsStarted += record.sessionsStarted;
      totals.playMs += record.playMs;
      totals.settlementsFounded += record.settlementsFounded;
      totals.worldRestarts += record.worldRestarts;
      totals.seasonRestarts += record.seasonRestarts;
      mergeCounters(actions, record.actions);
      mergePanels(panels, record.panels);
      return {
        date: record.date,
        uniquePlayers: record.uniquePlayerHashes.length,
        sessionsStarted: record.sessionsStarted,
        playMs: record.playMs,
        settlementsFounded: record.settlementsFounded,
        worldRestarts: record.worldRestarts,
        seasonRestarts: record.seasonRestarts,
        actions: cloneCounters(record.actions),
        panels: clonePanels(record.panels),
      };
    }).filter((entry) => (
      entry.uniquePlayers > 0
      || entry.sessionsStarted > 0
      || entry.playMs > 0
      || entry.settlementsFounded > 0
      || entry.worldRestarts > 0
      || entry.seasonRestarts > 0
      || Object.keys(entry.actions).length > 0
      || Object.keys(entry.panels).length > 0
    ));

    totals.uniquePlayers = uniquePlayers.size;

    return {
      range,
      generatedAt: new Date(now).toISOString(),
      current: {
        connectedSockets: Math.max(0, Math.floor(current.connectedSockets)),
        connectedPlayers: Math.max(0, Math.floor(current.connectedPlayers)),
      },
      totals,
      actions: cloneCounters(actions),
      panels: clonePanels(panels),
      topActions: Object.entries(actions)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 20)
        .map(([name, count]) => ({ name, count })),
      topPanels: Object.entries(panels)
        .sort((left, right) => right[1].opens - left[1].opens || right[1].totalOpenMs - left[1].totalOpenMs || left[0].localeCompare(right[0]))
        .slice(0, 20)
        .map(([name, panel]) => ({ name, opens: panel.opens, totalOpenMs: panel.totalOpenMs })),
      daily,
    };
  }

  private hashPlayerId(playerId: string) {
    return createHash('sha256').update(`${this.salt}:${playerId}`).digest('hex');
  }

  private ensureStorage() {
    mkdirSync(this.analyticsPath, { recursive: true });
  }

  private recordPath(date: string) {
    return join(this.analyticsPath, `${date}.json`);
  }

  private getRecord(date: string) {
    const cached = this.records.get(date);
    if (cached) {
      return cached;
    }

    const path = this.recordPath(date);
    if (!existsSync(path)) {
      const record = createEmptyRecord(date);
      this.records.set(date, record);
      return record;
    }

    try {
      const record = normalizeRecord(JSON.parse(readFileSync(path, 'utf8')) as Partial<DailyAnalyticsRecord>, date);
      this.records.set(date, record);
      return record;
    } catch (error) {
      console.warn(`[analytics] failed to read ${path}`, error);
      const record = createEmptyRecord(date);
      this.records.set(date, record);
      return record;
    }
  }

  private saveRecord(record: DailyAnalyticsRecord) {
    this.ensureStorage();
    const path = this.recordPath(record.date);
    const tempPath = `${path}.tmp`;
    writeFileSync(tempPath, JSON.stringify(record, null, 2));
    renameSync(tempPath, path);
    this.pruneOldRecords();
  }

  private pruneOldRecords() {
    this.ensureStorage();
    const cutoff = addDays(dayKey(this.now()), -this.retentionDays + 1);
    for (const fileName of readdirSync(this.analyticsPath)) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(fileName)) {
        continue;
      }

      const date = fileName.slice(0, 10);
      if (date >= cutoff) {
        continue;
      }

      unlinkSync(join(this.analyticsPath, fileName));
      this.records.delete(date);
    }
  }

  private panelKey(socketId: string, panelName: string) {
    return `${socketId}:${panelName}`;
  }

  private closePanel(key: string, at: number) {
    const active = this.activePanels.get(key);
    if (!active) {
      return;
    }

    const record = this.getRecord(dayKey(active.openedAt));
    addPanelDuration(record.panels, active.panelName, at - active.openedAt);
    this.activePanels.delete(key);
    this.saveRecord(record);
  }

  private flushSession(socketId: string, at: number) {
    const session = this.activeSessions.get(socketId);
    if (!session) {
      return;
    }

    this.addSessionDuration(session, at, true);
    this.activeSessions.delete(socketId);
  }

  private addSessionDuration(session: ActiveSession, at: number, persist: boolean) {
    const endAt = Math.max(session.lastFlushedAt, at);
    let cursor = session.lastFlushedAt;
    while (cursor < endAt) {
      const date = dayKey(cursor);
      const nextDay = dayStartMs(addDays(date, 1));
      const segmentEnd = Math.min(endAt, nextDay);
      const record = this.getRecord(date);
      if (!record.uniquePlayerHashes.includes(session.playerHash)) {
        record.uniquePlayerHashes.push(session.playerHash);
        record.uniquePlayerHashes.sort();
      }
      record.playMs += segmentEnd - cursor;
      if (persist) {
        this.saveRecord(record);
      }
      cursor = segmentEnd;
    }
    session.lastFlushedAt = endAt;
  }

  private cloneRecord(record: DailyAnalyticsRecord): DailyAnalyticsRecord {
    return {
      date: record.date,
      uniquePlayerHashes: record.uniquePlayerHashes.slice(),
      sessionsStarted: record.sessionsStarted,
      playMs: record.playMs,
      settlementsFounded: record.settlementsFounded,
      worldRestarts: record.worldRestarts,
      seasonRestarts: record.seasonRestarts,
      actions: { ...record.actions },
      panels: clonePanels(record.panels),
    };
  }

  private overlayActiveSessionDurations(records: DailyAnalyticsRecord[], days: Set<string>, now: number) {
    const byDate = new Map(records.map((record) => [record.date, record]));
    for (const session of this.activeSessions.values()) {
      let cursor = session.lastFlushedAt;
      while (cursor < now) {
        const date = dayKey(cursor);
        const nextDay = dayStartMs(addDays(date, 1));
        const segmentEnd = Math.min(now, nextDay);
        const record = byDate.get(date);
        if (record && days.has(date)) {
          if (!record.uniquePlayerHashes.includes(session.playerHash)) {
            record.uniquePlayerHashes.push(session.playerHash);
            record.uniquePlayerHashes.sort();
          }
          record.playMs += segmentEnd - cursor;
        }
        cursor = segmentEnd;
      }
    }
  }

  private overlayActivePanelDurations(records: DailyAnalyticsRecord[], days: Set<string>, now: number) {
    const byDate = new Map(records.map((record) => [record.date, record]));
    for (const active of this.activePanels.values()) {
      const date = dayKey(active.openedAt);
      const record = byDate.get(date);
      if (!record || !days.has(date)) {
        continue;
      }
      addPanelDuration(record.panels, active.panelName, now - active.openedAt);
    }
  }
}

function mergeCounters(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, value] of Object.entries(source)) {
    increment(target, key, value);
  }
}

function mergePanels(target: Record<string, PanelAggregate>, source: Record<string, PanelAggregate>) {
  for (const [key, value] of Object.entries(source)) {
    const aggregate = target[key] ?? { opens: 0, totalOpenMs: 0 };
    aggregate.opens += value.opens;
    aggregate.totalOpenMs += value.totalOpenMs;
    target[key] = aggregate;
  }
}

export const gameAnalytics = new GameAnalytics();

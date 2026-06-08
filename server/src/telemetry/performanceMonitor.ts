import { monitorEventLoopDelay, performance } from 'perf_hooks';

type CounterMap = Record<string, number>;

export interface ServerPerfStats {
  connectedSockets?: number;
  players?: number;
  connectedPlayers?: number;
  heroes?: number;
  settlers?: number;
  tasks?: number;
  activeTasks?: number;
  activeMovements?: number;
  [key: string]: number | undefined;
}

export interface TickSystemTiming {
  name: string;
  durationMs: number;
  dt: number;
}

export interface TickTiming {
  tick: number;
  dt: number;
  durationMs: number;
  systems: TickSystemTiming[];
}

export interface PathfindingTiming {
  source?: string;
  cacheLayer?: string;
  durationMs: number;
  start: { q: number; r: number };
  goal: { q: number; r: number };
  directDistance: number;
  pathLength: number;
  iterations: number;
  maxNodes: number;
  maxRange: number;
  found: boolean;
  allowScouted?: boolean;
  settlementRestricted?: boolean;
  cacheHit?: boolean;
  cacheSize?: number;
  cacheEpoch?: number;
  cacheWorldVersion?: number;
  cacheResetReason?: string;
  cacheEvictions?: number;
}

type StatsProvider = () => ServerPerfStats;

export interface CpuUsageMark {
  userMicros: number;
  systemMicros: number;
  observedAtMs: number;
}

export interface CpuUsageSample {
  elapsedMs: number;
  userMs: number;
  systemMs: number;
  totalMs: number;
  percentOfOneCore: number;
}

function parseOptionalNumber(value: string | undefined) {
  if (value == null || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEnabled(value: string | undefined) {
  return ['1', 'true', 'on', 'yes'].includes((value ?? '').trim().toLowerCase());
}

function readCpuUsageMark(): CpuUsageMark {
  const usage = process.cpuUsage();
  return {
    userMicros: usage.user,
    systemMicros: usage.system,
    observedAtMs: performance.now(),
  };
}

export function computeCpuUsageSample(previous: CpuUsageMark, current: CpuUsageMark): CpuUsageSample {
  const elapsedMs = Math.max(0, current.observedAtMs - previous.observedAtMs);
  const userMs = Math.max(0, current.userMicros - previous.userMicros) / 1_000;
  const systemMs = Math.max(0, current.systemMicros - previous.systemMicros) / 1_000;
  const totalMs = userMs + systemMs;

  return {
    elapsedMs,
    userMs,
    systemMs,
    totalMs,
    percentOfOneCore: elapsedMs > 0 ? (totalMs / elapsedMs) * 100 : 0,
  };
}

function emptyCounters(): CounterMap {
  return {};
}

function increment(map: CounterMap, key: string, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function addDurationAggregate(
  aggregates: Record<string, { count: number; totalMs: number; maxMs: number }>,
  key: string,
  durationMs: number,
) {
  const aggregate = aggregates[key] ?? { count: 0, totalMs: 0, maxMs: 0 };
  aggregate.count += 1;
  aggregate.totalMs += durationMs;
  aggregate.maxMs = Math.max(aggregate.maxMs, durationMs);
  aggregates[key] = aggregate;
}

function cloneCounters(map: CounterMap) {
  return Object.fromEntries(Object.entries(map).sort(([left], [right]) => left.localeCompare(right)));
}

function cloneDurationAggregates(aggregates: Record<string, { count: number; totalMs: number; maxMs: number }>) {
  return Object.fromEntries(
    Object.entries(aggregates)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, aggregate]) => [
        key,
        {
          count: aggregate.count,
          avgMs: aggregate.count > 0 ? aggregate.totalMs / aggregate.count : 0,
          maxMs: aggregate.maxMs,
          totalMs: aggregate.totalMs,
        },
      ]),
  );
}

function ringPush<T>(items: T[], item: T, limit: number) {
  items.push(item);
  while (items.length > limit) {
    items.shift();
  }
}

function roughMessageBytes(message: unknown) {
  try {
    return JSON.stringify(message)?.length ?? 0;
  } catch {
    return 0;
  }
}

class PerformanceMonitor {
  private readonly enabled = parseEnabled(process.env.SERVER_PERF_DEBUG)
    || parseEnabled(process.env.DRIFTLANDS_PERF_DEBUG);
  private readonly intervalMs = Math.max(1000, Math.floor(parseOptionalNumber(process.env.SERVER_PERF_INTERVAL_MS) ?? 10_000));
  private readonly slowTickMs = Math.max(1, Math.floor(parseOptionalNumber(process.env.SERVER_PERF_SLOW_TICK_MS) ?? 50));
  private readonly slowSystemMs = Math.max(1, Math.floor(parseOptionalNumber(process.env.SERVER_PERF_SLOW_SYSTEM_MS) ?? 25));
  private readonly slowCommandMs = Math.max(1, Math.floor(parseOptionalNumber(process.env.SERVER_PERF_SLOW_COMMAND_MS) ?? 75));
  private readonly slowPathMs = Math.max(1, Math.floor(parseOptionalNumber(process.env.SERVER_PERF_SLOW_PATH_MS) ?? 25));
  private readonly slowSaveMs = Math.max(1, Math.floor(parseOptionalNumber(process.env.SERVER_PERF_SLOW_SAVE_MS) ?? 100));
  private readonly eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  private timer: ReturnType<typeof setInterval> | null = null;
  private statsProvider: StatsProvider = () => ({});
  private lastCpuUsageMark = readCpuUsageMark();

  private tickCount = 0;
  private tickTotalMs = 0;
  private tickMaxMs = 0;
  private systemAggregates: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
  private systemPhaseAggregates: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
  private messageCounts = emptyCounters();
  private messageBytes = emptyCounters();
  private pathAggregates: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
  private pathCacheCounts = emptyCounters();
  private pathCacheLayerCounts = emptyCounters();
  private commandAggregates: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
  private saveAggregates: Record<string, { count: number; totalMs: number; maxMs: number }> = {};

  private readonly samples: unknown[] = [];
  private readonly slowTicks: unknown[] = [];
  private readonly slowSystems: unknown[] = [];
  private readonly slowCommands: unknown[] = [];
  private readonly slowPathfinds: unknown[] = [];
  private readonly slowSaves: unknown[] = [];

  isEnabled() {
    return this.enabled;
  }

  setStatsProvider(provider: StatsProvider) {
    this.statsProvider = provider;
  }

  start() {
    if (!this.enabled || this.timer) {
      return;
    }

    this.eventLoopDelay.enable();
    this.lastCpuUsageMark = readCpuUsageMark();
    this.timer = setInterval(() => this.flushSample('interval'), this.intervalMs);
    this.timer.unref?.();
    console.log(`[perf] enabled intervalMs=${this.intervalMs} slowTickMs=${this.slowTickMs} slowSystemMs=${this.slowSystemMs} slowCommandMs=${this.slowCommandMs} slowPathMs=${this.slowPathMs}`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.enabled) {
      this.eventLoopDelay.disable();
    }
  }

  recordTick(timing: TickTiming) {
    if (!this.enabled) return;

    this.tickCount += 1;
    this.tickTotalMs += timing.durationMs;
    this.tickMaxMs = Math.max(this.tickMaxMs, timing.durationMs);

    if (timing.durationMs >= this.slowTickMs) {
      const slowTick = {
        at: new Date().toISOString(),
        tick: timing.tick,
        dt: timing.dt,
        durationMs: timing.durationMs,
        systems: timing.systems
          .slice()
          .sort((left, right) => right.durationMs - left.durationMs)
          .slice(0, 8),
        stats: this.safeStats(),
      };
      ringPush(this.slowTicks, slowTick, 60);
      console.warn('[perf:slow_tick]', JSON.stringify(slowTick));
    }
  }

  recordSystem(timing: TickSystemTiming & { tick: number }) {
    if (!this.enabled) return;

    addDurationAggregate(this.systemAggregates, timing.name, timing.durationMs);
    if (timing.durationMs >= this.slowSystemMs) {
      const slowSystem = {
        at: new Date().toISOString(),
        tick: timing.tick,
        name: timing.name,
        dt: timing.dt,
        durationMs: timing.durationMs,
      };
      ringPush(this.slowSystems, slowSystem, 120);
    }
  }

  recordSystemPhase(system: string, phase: string, durationMs: number) {
    if (!this.enabled) return;

    addDurationAggregate(this.systemPhaseAggregates, `${system}:${phase}`, durationMs);
  }

  recordInboundMessage(message: { type?: string } | null | undefined) {
    if (!this.enabled) return;
    increment(this.messageCounts, `in:${message?.type ?? 'unknown'}`);
  }

  recordOutboundMessage(kind: 'send' | 'broadcast', message: { type?: string } | null | undefined) {
    if (!this.enabled) return;

    const type = message?.type ?? 'unknown';
    increment(this.messageCounts, `${kind}:${type}`);
    increment(this.messageBytes, `${kind}:${type}`, roughMessageBytes(message));
  }

  recordCommand(type: string, durationMs: number, details: Record<string, unknown> = {}) {
    if (!this.enabled) return;

    addDurationAggregate(this.commandAggregates, type, durationMs);
    if (durationMs >= this.slowCommandMs) {
      const slowCommand = {
        at: new Date().toISOString(),
        type,
        durationMs,
        ...details,
      };
      ringPush(this.slowCommands, slowCommand, 120);
      console.warn('[perf:slow_command]', JSON.stringify(slowCommand));
    }
  }

  recordPathfinding(timing: PathfindingTiming) {
    if (!this.enabled) return;

    const source = timing.source || 'unspecified';
    const cacheLayer = timing.cacheLayer || 'path_service';
    addDurationAggregate(this.pathAggregates, source, timing.durationMs);
    increment(this.pathCacheCounts, `${source}:${timing.cacheHit ? 'hit' : 'miss'}`);
    increment(this.pathCacheLayerCounts, `${source}:${cacheLayer}:${timing.cacheHit ? 'hit' : 'miss'}`);
    if (timing.durationMs >= this.slowPathMs) {
      const slowPath = {
        at: new Date().toISOString(),
        ...timing,
      };
      ringPush(this.slowPathfinds, slowPath, 120);
      console.warn('[perf:slow_path]', JSON.stringify(slowPath));
    }
  }

  recordPersistenceSave(reason: string, durationMs: number, status: 'ok' | 'failed' | 'skipped') {
    if (!this.enabled) return;

    addDurationAggregate(this.saveAggregates, `${reason}:${status}`, durationMs);
    if (durationMs >= this.slowSaveMs) {
      const slowSave = {
        at: new Date().toISOString(),
        reason,
        status,
        durationMs,
      };
      ringPush(this.slowSaves, slowSave, 60);
      console.warn('[perf:slow_save]', JSON.stringify(slowSave));
    }
  }

  getSnapshot() {
    const current = this.buildSample('current', false);
    return {
      enabled: this.enabled,
      config: {
        intervalMs: this.intervalMs,
        slowTickMs: this.slowTickMs,
        slowSystemMs: this.slowSystemMs,
        slowCommandMs: this.slowCommandMs,
        slowPathMs: this.slowPathMs,
        slowSaveMs: this.slowSaveMs,
      },
      current,
      samples: this.samples,
      slowTicks: this.slowTicks,
      slowSystems: this.slowSystems,
      slowCommands: this.slowCommands,
      slowPathfinds: this.slowPathfinds,
      slowSaves: this.slowSaves,
    };
  }

  private flushSample(reason: string) {
    if (!this.enabled) return;

    const sample = this.buildSample(reason, true);
    ringPush(this.samples, sample, 120);
    console.log('[perf:sample]', JSON.stringify(sample));

    this.tickCount = 0;
    this.tickTotalMs = 0;
    this.tickMaxMs = 0;
    this.systemAggregates = {};
    this.systemPhaseAggregates = {};
    this.messageCounts = emptyCounters();
    this.messageBytes = emptyCounters();
    this.pathAggregates = {};
    this.pathCacheCounts = emptyCounters();
    this.pathCacheLayerCounts = emptyCounters();
    this.commandAggregates = {};
    this.saveAggregates = {};
    this.eventLoopDelay.reset();
  }

  private buildSample(reason: string, includeEventLoopResettable: boolean) {
    const memory = process.memoryUsage();
    const cpu = this.captureCpuUsage(includeEventLoopResettable);
    const eventLoop = this.enabled
      ? {
          meanMs: Number.isFinite(this.eventLoopDelay.mean) ? this.eventLoopDelay.mean / 1_000_000 : 0,
          maxMs: this.eventLoopDelay.max / 1_000_000,
          p95Ms: this.eventLoopDelay.percentile(95) / 1_000_000,
          p99Ms: this.eventLoopDelay.percentile(99) / 1_000_000,
        }
      : null;

    return {
      at: new Date().toISOString(),
      reason,
      stats: this.safeStats(),
      memory: {
        rssMb: memory.rss / 1024 / 1024,
        heapUsedMb: memory.heapUsed / 1024 / 1024,
        heapTotalMb: memory.heapTotal / 1024 / 1024,
        externalMb: memory.external / 1024 / 1024,
      },
      cpu,
      eventLoop,
      ticks: {
        count: this.tickCount,
        avgMs: this.tickCount > 0 ? this.tickTotalMs / this.tickCount : 0,
        maxMs: this.tickMaxMs,
      },
      systems: cloneDurationAggregates(this.systemAggregates),
      systemPhases: cloneDurationAggregates(this.systemPhaseAggregates),
      commands: cloneDurationAggregates(this.commandAggregates),
      pathfinding: cloneDurationAggregates(this.pathAggregates),
      pathfindingCache: cloneCounters(this.pathCacheCounts),
      pathfindingCacheLayers: cloneCounters(this.pathCacheLayerCounts),
      persistence: cloneDurationAggregates(this.saveAggregates),
      messages: cloneCounters(this.messageCounts),
      messageBytes: cloneCounters(this.messageBytes),
      resettable: includeEventLoopResettable,
    };
  }

  private safeStats() {
    try {
      return this.statsProvider();
    } catch (error) {
      return {
        statsError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private captureCpuUsage(updateBaseline: boolean) {
    const current = readCpuUsageMark();
    const sample = computeCpuUsageSample(this.lastCpuUsageMark, current);
    if (updateBaseline) {
      this.lastCpuUsageMark = current;
    }
    return sample;
  }
}

export const performanceMonitor = new PerformanceMonitor();

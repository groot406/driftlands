import { serverRNG } from './rng';
import { performanceMonitor, type TickSystemTiming } from './telemetry/performanceMonitor';

export type TickContext = {
  now: number; // ms timestamp
  dt: number; // ms delta since last tick
  tick: number; // tick count
  rng: typeof serverRNG; // deterministic RNG instance
};

export interface System {
  name: string;
  intervalMs?: number;
  init?: () => void;
  tick: (ctx: TickContext) => void | Promise<void>;
}

function parseOptionalNumber(value: string | undefined) {
  if (value == null || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const tickProfilingEnabled = ['1', 'true', 'on', 'yes'].includes((process.env.DRIFTLANDS_TICK_PROFILE ?? '').trim().toLowerCase());
const slowSystemWarnMs = Math.max(1, Math.floor(parseOptionalNumber(process.env.DRIFTLANDS_SLOW_SYSTEM_WARN_MS) ?? 25));
const slowTickWarnMs = Math.max(1, Math.floor(parseOptionalNumber(process.env.DRIFTLANDS_SLOW_TICK_WARN_MS) ?? 50));

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

class TickEngine {
  private systems: System[] = [];
  private lastSystemTickTime = new Map<System, number>();
  private tps: number = 10;
  private tickTimer: NodeJS.Timeout | null = null;
  private running = false;
  private ticking = false;
  private lastTickTime: number = Date.now();
  private tickCount: number = 0;

  setTPS(tps: number) {
    this.tps = Math.max(1, Math.min(120, Math.floor(tps)));
    if (this.running) {
      this.restart();
    }
  }

  setSeed(seed: number) {
    serverRNG.setSeed(seed);
  }

  register(system: System) {
    this.systems.push(system);
    this.lastSystemTickTime.set(system, 0);
    system.init?.();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTickTime = Date.now();
    this.scheduleNextTick();
  }

  restart() {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }

    if (this.running && !this.ticking) {
      this.scheduleNextTick();
    }
  }

  stop() {
    this.running = false;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private scheduleNextTick(delayMs: number = Math.floor(1000 / this.tps)) {
    if (!this.running || this.tickTimer) return;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      void this.runTick();
    }, Math.max(0, delayMs));
  }

  private async runTick() {
    if (!this.running) return;
    this.ticking = true;

    const now = Date.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;
    this.tickCount += 1;
    const ctx: TickContext = { now, dt, tick: this.tickCount, rng: serverRNG };
    const collectTiming = tickProfilingEnabled || performanceMonitor.isEnabled();
    const tickStartedAt = collectTiming ? Date.now() : 0;
    const systemTimings: TickSystemTiming[] = [];
    try {
      for (const sys of this.systems) {
        const intervalMs = Math.max(0, Math.floor(sys.intervalMs ?? 0));
        let systemCtx = ctx;
        if (intervalMs > 0) {
          const lastSystemTickAt = this.lastSystemTickTime.get(sys) ?? 0;
          if (lastSystemTickAt > 0 && now - lastSystemTickAt < intervalMs) {
            continue;
          }

          this.lastSystemTickTime.set(sys, now);
          systemCtx = {
            ...ctx,
            dt: lastSystemTickAt > 0 ? now - lastSystemTickAt : dt,
          };
        }

        const systemStartedAt = collectTiming ? Date.now() : 0;
        try {
          await sys.tick(systemCtx);
        } catch (e) {
          console.error(`[TickEngine] System '${sys.name}' tick error:`, e);
        }
        if (collectTiming) {
          const elapsedMs = Date.now() - systemStartedAt;
          const timing = { name: sys.name, durationMs: elapsedMs, dt: systemCtx.dt };
          systemTimings.push(timing);
          performanceMonitor.recordSystem({ ...timing, tick: this.tickCount });
          if (tickProfilingEnabled && elapsedMs >= slowSystemWarnMs) {
            console.warn(`[TickEngine] slow system '${sys.name}' ${elapsedMs}ms tick=${this.tickCount} dt=${systemCtx.dt}ms`);
          }
        }

        await yieldToEventLoop();
      }
      if (collectTiming) {
        const elapsedMs = Date.now() - tickStartedAt;
        performanceMonitor.recordTick({
          tick: this.tickCount,
          dt,
          durationMs: elapsedMs,
          systems: systemTimings,
        });
        if (tickProfilingEnabled && elapsedMs >= slowTickWarnMs) {
          console.warn(`[TickEngine] slow tick ${elapsedMs}ms tick=${this.tickCount} dt=${dt}ms`);
        }
      }
    } finally {
      this.ticking = false;
      const tickIntervalMs = Math.floor(1000 / this.tps);
      const elapsedMs = Date.now() - now;
      this.scheduleNextTick(Math.max(0, tickIntervalMs - elapsedMs));
    }
  }
}

export const tickEngine = new TickEngine();

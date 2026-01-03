import { serverRNG } from './rng';

export type TickContext = {
  now: number; // ms timestamp
  dt: number; // ms delta since last tick
  tick: number; // tick count
  rng: typeof serverRNG; // deterministic RNG instance
};

export interface System {
  name: string;
  init?: () => void;
  tick: (ctx: TickContext) => void;
}

class TickEngine {
  private systems: System[] = [];
  private tps: number = 10;
  private tickInterval: NodeJS.Timeout | null = null;
  private lastTickTime: number = Date.now();
  private tickCount: number = 0;

  setTPS(tps: number) {
    this.tps = Math.max(1, Math.min(120, Math.floor(tps)));
    this.restart();
  }

  setSeed(seed: number) {
    serverRNG.setSeed(seed);
  }

  register(system: System) {
    this.systems.push(system);
    system.init?.();
  }

  start() {
    if (this.tickInterval) return;
    this.lastTickTime = Date.now();
    this.tickInterval = setInterval(() => this.runTick(), Math.floor(1000 / this.tps));
  }

  restart() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.start();
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private runTick() {
    const now = Date.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;
    this.tickCount += 1;
    const ctx: TickContext = { now, dt, tick: this.tickCount, rng: serverRNG };
    for (const sys of this.systems) {
      try {
        sys.tick(ctx);
      } catch (e) {
        console.error(`[TickEngine] System '${sys.name}' tick error:`, e);
      }
    }
  }
}

export const tickEngine = new TickEngine();

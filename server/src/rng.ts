// Deterministic seeded RNG for server systems
// Mulberry32 implementation with seed control
export class RNG {
  private seed: number;
  constructor(seed: number = 123456789) {
    this.seed = seed >>> 0;
  }
  setSeed(seed: number) {
    this.seed = seed >>> 0;
  }
  // Returns a float in [0,1)
  next(): number {
    let t = (this.seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // Returns integer in [min, max]
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  // Returns float in [min, max)
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}

export const serverRNG = new RNG();

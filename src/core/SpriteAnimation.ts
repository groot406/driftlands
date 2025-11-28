// SpriteAnimation.ts
// Helper classes & types to define sprite sheet animations by row/frame.
// Rows are zero-based indices into the spritesheet (top row = 0).
// frameDuration = milliseconds per frame advance.

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface AnimationDef {
  name: string;
  row: number; // zero-based row
  frames: number; // number of frames in the row for this animation
  frameDuration: number; // ms per frame
  cooldown?: number; // optional pause after one cycle (ms)
}

export interface AnimationSetOptions {
  size: number; // square frame size (px)
  animations: Record<string, AnimationDef>;
}

export class SpriteAnimationSet {
  readonly size: number;
  private _map: Record<string, AnimationDef>;
  constructor(opts: AnimationSetOptions) {
    this.size = opts.size;
    this._map = opts.animations;
  }
  get(name: string): AnimationDef | undefined { return this._map[name]; }
  list(): AnimationDef[] { return Object.values(this._map); }
}


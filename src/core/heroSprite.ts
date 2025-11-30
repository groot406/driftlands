// heroSprite.ts
// Defines hero-specific animations. Spritesheet layout (rows start at 0):
// Row 0: Attack Right (5 frames)
// Row 1: Walk Right (4 frames)
// Row 2: Idle Right (2 frames)
// Row 3: Attack Up (5 frames)
// Row 4: Walk Up (4 frames)
// Row 5: Idle Up (2 frames)
// Row 6: Attack Down (5 frames)
// Row 7: Walk Down (4 frames)
// Row 8: Idle Down (2 frames)
// Left-facing uses the same Right rows with horizontal flip.

import {SpriteAnimationSet} from './SpriteAnimation';

export const HERO_FRAME_SIZE = 32;

export const heroAnimationSet = new SpriteAnimationSet({
  size: HERO_FRAME_SIZE,
  animations: {
    attackRight: {name:'attackRight', row:0, frames:5, frameDuration:90},
    walkRight: {name:'walkRight', row:1, frames:4, frameDuration:130},
    idleRight: {name:'idleRight', row:2, frames:2, frameDuration:550},
    attackUp: {name:'attackUp', row:3, frames:5, frameDuration:90},
    walkUp: {name:'walkUp', row:4, frames:4, frameDuration:130},
    idleUp: {name:'idleUp', row:5, frames:2, frameDuration:550},
    attackDown: {name:'attackDown', row:6, frames:5, frameDuration:90},
    walkDown: {name:'walkDown', row:7, frames:4, frameDuration:130},
    idleDown: {name:'idleDown', row:8, frames:2, frameDuration:550},
  }
});

// Convenience mapping by facing + activity
export type HeroActivity = 'idle' | 'walk' | 'attack';
export function heroAnimName(activity: HeroActivity, facing: 'up'|'down'|'right'|'left'): string {
  const baseFacing = facing === 'left' ? 'right' : facing; // reuse right for left flip
  return `${activity}${baseFacing.charAt(0).toUpperCase()}${baseFacing.slice(1)}`; // e.g. idleDown
}

// Derive horizontal flip requirement based on facing.
export function shouldFlip(facing: 'up'|'down'|'right'|'left'): boolean {
  return facing === 'left';
}

// Simple state resolver: choose walk when path preview length > 1 else idle.
export function resolveActivity(pathLen: number): HeroActivity {
  return pathLen > 0 ? 'walk' : 'idle';
}


import { SpriteAnimationSet } from './SpriteAnimation';
import type { Settler } from './types/Settler';

export const SETTLER_FRAME_SIZE = 32;

export const settlerAnimationSet = new SpriteAnimationSet({
    size: SETTLER_FRAME_SIZE,
    animations: {
        attackRight: { name: 'attackRight', row: 0, frames: 5, frameDuration: 90 },
        walkRight: { name: 'walkRight', row: 1, frames: 4, frameDuration: 130 },
        idleRight: { name: 'idleRight', row: 2, frames: 2, frameDuration: 550 },
        attackUp: { name: 'attackUp', row: 3, frames: 5, frameDuration: 90 },
        walkUp: { name: 'walkUp', row: 4, frames: 4, frameDuration: 130 },
        idleUp: { name: 'idleUp', row: 5, frames: 2, frameDuration: 550 },
        attackDown: { name: 'attackDown', row: 6, frames: 5, frameDuration: 90 },
        walkDown: { name: 'walkDown', row: 7, frames: 4, frameDuration: 130 },
        idleDown: { name: 'idleDown', row: 8, frames: 2, frameDuration: 550 },
    },
});

export type SettlerSpriteActivity = 'idle' | 'walk' | 'attack';

export function settlerAnimName(activity: SettlerSpriteActivity, facing: Settler['facing']) {
    const baseFacing = facing === 'left' ? 'right' : facing;
    return `${activity}${baseFacing.charAt(0).toUpperCase()}${baseFacing.slice(1)}`;
}

import { SpriteAnimationSet } from './SpriteAnimation';
import type { Settler } from './types/Settler';
import { normalizeSettlerGender } from '../shared/game/settlerNames';

export const SETTLER_FRAME_SIZE = 32;

export const SETTLER_SPRITE_KEYS = [
    'default',
    'female_braid',
    'female_bright',
    'copper_jacket',
    'headband_worker',
] as const;

export type SettlerSpriteKey = typeof SETTLER_SPRITE_KEYS[number];

const MALE_SETTLER_SPRITE_KEYS: readonly SettlerSpriteKey[] = ['default', 'copper_jacket', 'headband_worker'];
const FEMALE_SETTLER_SPRITE_KEYS: readonly SettlerSpriteKey[] = ['female_braid', 'female_bright'];

export function getSettlerSpriteKey(settler: Pick<Settler, 'id' | 'appearanceSeed' | 'nameSeed' | 'gender'>): SettlerSpriteKey {
    const seed = Number.isFinite(settler.appearanceSeed) ? settler.appearanceSeed : 0;
    const spriteKeys = normalizeSettlerGender(settler) === 'female'
        ? FEMALE_SETTLER_SPRITE_KEYS
        : MALE_SETTLER_SPRITE_KEYS;
    const index = Math.abs(Math.trunc(seed)) % spriteKeys.length;
    return spriteKeys[index] ?? 'default';
}

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

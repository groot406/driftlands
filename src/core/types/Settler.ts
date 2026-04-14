import type { HeroMovementState } from './Hero';
import type { ResourceAmount } from './Resource';

export type SettlerActivity =
    | 'idle'
    | 'sleeping'
    | 'commuting_home'
    | 'commuting_work'
    | 'working'
    | 'fetching_food'
    | 'fetching_input'
    | 'delivering'
    | 'waiting';

export interface Settler {
    id: string;
    q: number;
    r: number;
    facing: 'up' | 'down' | 'left' | 'right';
    appearanceSeed: number;
    homeTileId: string;
    homeAccessTileId: string;
    settlementId: string | null;
    assignedWorkTileId: string | null;
    activity: SettlerActivity;
    stateSinceMs: number;
    hungerMs: number;
    fatigueMs: number;
    workProgressMs: number;
    carryingKind: 'input' | 'output' | null;
    movement?: HeroMovementState;
    carryingPayload?: ResourceAmount;
}

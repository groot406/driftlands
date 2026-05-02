import type { HeroMovementState } from './Hero';
import type { ResourceAmount, ResourceType } from './Resource';

export type SettlerActivity =
    | 'idle'
    | 'sleeping'
    | 'commuting_home'
    | 'commuting_work'
    | 'commuting_social'
    | 'working'
    | 'socializing'
    | 'repairing'
    | 'fetching_food'
    | 'fetching_input'
    | 'delivering'
    | 'waiting';

export type DrinkPreference = 'beer' | 'wine' | 'either';

export type SettlerTrait =
    | 'long_worker'
    | 'short_worker'
    | 'light_sleeper'
    | 'heavy_sleeper'
    | 'social'
    | 'independent'
    | 'easy_to_please'
    | 'hard_to_please'
    | 'big_eater'
    | 'small_eater';

export type SettlerBlockerCode =
    | 'missing_input'
    | 'missing_repair_material'
    | 'storage_full'
    | 'path_blocked'
    | 'site_offline'
    | 'site_paused'
    | 'resource_depleted'
    | 'no_work';

export interface SettlerBlockerReason {
    code: SettlerBlockerCode;
    resourceType?: ResourceType;
    amount?: number;
    tileId?: string;
}

export interface Settler {
    id: string;
    nameSeed?: number;
    q: number;
    r: number;
    facing: 'up' | 'down' | 'left' | 'right';
    appearanceSeed: number;
    homeTileId: string;
    homeAccessTileId: string;
    settlementId: string | null;
    assignedWorkTileId: string | null;
    assignedRole?: 'job' | 'repair' | null;
    workTileId?: string | null;
    hiddenWhileWorking?: boolean | null;
    activity: SettlerActivity;
    blockerReason?: SettlerBlockerReason | null;
    stateSinceMs: number;
    hungerMs: number;
    fatigueMs: number;
    happiness: number;
    drinkPreference?: DrinkPreference;
    traits?: SettlerTrait[];
    workProgressMs: number;
    carryingKind: 'input' | 'output' | null;
    socialTileId?: string | null;
    movement?: HeroMovementState;
    carryingPayload?: ResourceAmount;
}

import type { HeroMovementState } from './Hero';
import type { ResourceAmount, ResourceType } from './Resource';
import type { SettlerGender } from '../../shared/game/settlerNames';

export type SettlerActivity =
    | 'idle'
    | 'sleeping'
    | 'commuting_home'
    | 'commuting_work'
    | 'commuting_social'
    | 'commuting_shop'
    | 'defending'
    | 'raiding'
    | 'working'
    | 'socializing'
    | 'shopping'
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
    | 'small_eater'
    | 'shopper'
    | 'frugal';

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

export type SettlerFieldWorkPhase = 'prepare_land' | 'irrigate' | 'seed' | 'harvest' | 'process' | 'chop_forest' | 'replant_forest';

export interface SettlerFieldWorkState {
    siteTileId: string;
    fieldTileId: string | null;
    phase: SettlerFieldWorkPhase;
}

export interface Settler {
    id: string;
    nameSeed?: number;
    gender?: SettlerGender;
    q: number;
    r: number;
    facing: 'up' | 'down' | 'left' | 'right';
    appearanceSeed: number;
    homeTileId: string;
    homeAccessTileId: string;
    settlementId: string | null;
    assignedWorkTileId: string | null;
    assignedRole?: 'job' | 'repair' | 'guard' | null;
    guardTowerTileId?: string | null;
    workTileId?: string | null;
    hiddenWhileWorking?: boolean | null;
    fieldWork?: SettlerFieldWorkState | null;
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
    combatHealth?: number | null;
    combatHealthMax?: number | null;
}

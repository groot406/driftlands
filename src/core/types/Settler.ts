import type { HeroMovementState } from './Hero';
import type { ResourceAmount, ResourceType } from './Resource';

export type SettlerActivity =
    | 'idle'
    | 'sleeping'
    | 'commuting_home'
    | 'commuting_work'
    | 'working'
    | 'repairing'
    | 'fetching_food'
    | 'fetching_input'
    | 'delivering'
    | 'waiting';

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
    workProgressMs: number;
    carryingKind: 'input' | 'output' | null;
    movement?: HeroMovementState;
    carryingPayload?: ResourceAmount;
}

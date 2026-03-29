// Shared protocol definitions for client-server communication
import type {Tile} from "../core/types/Tile.ts";
import type {Hero, HeroStats} from "../core/types/Hero.ts";
import type {TaskInstance, TaskType} from "../core/types/Task.ts";
import type {ResourceAmount, ResourceType} from "../core/types/Resource.ts";
import type {CoopPingKind, CoopPingSnapshot, CoopStateSnapshot} from "./coop/types.ts";
import type {RunSnapshot} from "./goals/types.ts";
import type {StorageSnapshot} from "./game/storage.ts";

export interface BaseMessage {
    type: string;
    id?: string;
    timestamp?: number;
}


// Game-related messages
export interface PlayerJoinMessage extends BaseMessage {
    type: 'player:join';
    playerId: string;
    playerName: string;
}

export interface PlayerLeaveMessage extends BaseMessage {
    type: 'player:leave';
    playerId: string;
}

export interface PlayerCountMessage extends BaseMessage {
    type: 'player:count';
    count: number;
}

export interface ChatMessage extends BaseMessage {
    type: 'chat:message';
    playerId: string;
    playerName: string;
    message: string;
}

export interface CoopSnapshotMessage extends BaseMessage {
    type: 'coop:snapshot';
    state: CoopStateSnapshot;
}

export interface CoopSetReadyMessage extends BaseMessage {
    type: 'coop:set_ready';
    ready: boolean;
}

export interface CoopHeroClaimMessage extends BaseMessage {
    type: 'coop:hero_claim';
    heroId: string;
}

export interface CoopHeroReleaseMessage extends BaseMessage {
    type: 'coop:hero_release';
    heroId: string;
}

export interface CoopPingRequestMessage extends BaseMessage {
    type: 'coop:request_ping';
    kind: CoopPingKind;
    q: number;
    r: number;
    heroId?: string;
}

export interface CoopPingMessage extends BaseMessage {
    type: 'coop:ping';
    ping: CoopPingSnapshot;
}

export interface WorldWelcomeMessage extends BaseMessage {
    type: 'world:welcome';
}

export interface WorldRequestMessage extends BaseMessage {
    type: 'world:request';
}

export interface WorldSnapshotMessage extends BaseMessage {
    type: 'world:snapshot';
    tiles: Tile[];
    heroes: Hero[];
    tasks: TaskInstance[];
    resources: Partial<Record<ResourceType, number>>;
    storages: StorageSnapshot[];
}

export interface TileUpdatedMessage extends BaseMessage {
    type: 'tile:updated';
    tile: Tile;
}

export interface MoveRequestMessage extends BaseMessage {
    type: 'hero:move_request';
    heroId: string;
    startAt: number; // optional client timestamp for when movement started
    origin: { q: number; r: number };
    target: { q: number; r: number };
    // optional client-computed path for validation; server may override
    path?: { q: number; r: number }[];
    task?: TaskType;
}

export interface PathUpdateMessage extends BaseMessage {
    type: 'hero:path_update';
    heroId: string;
    origin: { q: number; r: number };
    path: { q: number; r: number }[]; // excluding origin, including destination
    target: { q: number; r: number };
    startAt: number; // absolute timestamp for when movement began (or will begin)
    startDelayMs: number; // client should start movement after this delay from receipt or now
    stepDurations: number[]; // per-step durations
    cumulative: number[]; // cumulative end times
    task?: TaskType;
}

// Hero state updates
export interface HeroPayloadUpdateMessage extends BaseMessage {
    type: 'hero:payload_update';
    heroId: string;
    payload: ResourceAmount | null;
}

// Task lifecycle
export interface StartTaskRequestMessage extends BaseMessage {
    type: 'task:request_start';
    heroId: string;
    task: TaskType;
    location: { q: number; r: number };
}

export interface JoinTaskRequestMessage {
    type: 'task:request_join';
    heroId: string;
    taskId: string;
}

export interface LeaveTaskRequestMessage {
    type: 'task:request_leave';
    heroId: string;
    taskId: string;
}

export interface ResourceDepositMessage {
    type: 'resource:deposit';
    heroId: string;
    storageTileId: string;
    resource: ResourceAmount;
}

export interface ResourceWithdrawMessage {
    type: 'resource:withdraw';
    heroId: string;
    storageTileId: string;
    resource: ResourceAmount;
}

export interface FrontierFindMessage extends BaseMessage {
    type: 'frontier:find';
    q: number;
    r: number;
    terrain: string | null;
    label: string;
    title: string;
    description: string;
    resourceRewards: ResourceAmount[];
    storageDeposits?: Array<{
        storageTileId: string;
        resource: ResourceAmount;
    }>;
    bonusScore?: number;
}

export interface TaskCreatedMessage {
    type: 'task:created';
    taskId: string;
    taskType: TaskType;
    tileId: string;
    requiredXp: number;
    participantIds: string[];
    requiredResources?: ResourceAmount[];
}

export interface TaskProgressMessage {
    type: 'task:progress';
    taskId: string;
    progressXp: number;
    participants: Record<string, number>;
    // Optional fields to reflect resource collection state and activation toggles
    collectedResources?: ResourceAmount[];
    active?: boolean;
}

export interface TaskCompletedMessage {
    type: 'task:completed';
    taskId: string;
    rewards: {
        heroId: string;
        stats: Partial<HeroStats>;
        resources?: ResourceAmount;
    }[];
}

export interface TaskRemovedMessage {
    type: 'task:removed';
    taskId: string;
    tileId: string;
}

export interface RunSnapshotMessage extends BaseMessage {
    type: 'run:snapshot';
    run: RunSnapshot;
}

export interface RunUpdateMessage extends BaseMessage {
    type: 'run:update';
    run: RunSnapshot;
}

export type ClientMessage =
    | PlayerJoinMessage
    | PlayerLeaveMessage
    | ChatMessage
    | CoopSetReadyMessage
    | CoopHeroClaimMessage
    | CoopHeroReleaseMessage
    | CoopPingRequestMessage
    | WorldRequestMessage
    | MoveRequestMessage
    | StartTaskRequestMessage
    | JoinTaskRequestMessage
    | LeaveTaskRequestMessage

export type ServerMessage =
    | PlayerJoinMessage
    | PlayerLeaveMessage
    | PlayerCountMessage
    | ChatMessage
    | CoopSnapshotMessage
    | CoopPingMessage
    | WorldSnapshotMessage
    | WorldWelcomeMessage
    | TileUpdatedMessage
    | PathUpdateMessage
    | TaskCreatedMessage
    | TaskProgressMessage
    | TaskRemovedMessage
    | TaskCompletedMessage
    | ResourceDepositMessage
    | ResourceWithdrawMessage
    | FrontierFindMessage
    | HeroPayloadUpdateMessage
    | RunSnapshotMessage
    | RunUpdateMessage;

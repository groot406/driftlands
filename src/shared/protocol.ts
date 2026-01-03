// Shared protocol definitions for client-server communication
import type {Tile} from "../core/types/Tile.ts";
import type {Hero, HeroStats} from "../core/types/Hero.ts";
import type {TaskInstance, TaskType} from "../core/types/Task.ts";
import type {ResourceAmount, ResourceType} from "../core/types/Resource.ts";

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
    resource: ResourceAmount;
}

export interface ResourceWithdrawMessage {
    type: 'resource:withdraw';
    heroId: string;
    resource: ResourceAmount;
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

export type ClientMessage =
    | PlayerJoinMessage
    | PlayerLeaveMessage
    | ChatMessage
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
    | HeroPayloadUpdateMessage;

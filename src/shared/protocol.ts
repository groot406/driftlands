// Shared protocol definitions for client-server communication

import type {Tile} from "../core/world.ts";
import type {TaskType} from "../core/tasks.ts";

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

export interface GameStateMessage extends BaseMessage {
    type: 'game:state';
    state: any; // Define your game state structure here
}

export interface PlayerCountMessage extends BaseMessage {
    type: 'player:count';
    count: number;
}

export interface PlayerActionMessage extends BaseMessage {
    type: 'player:action';
    playerId: string;
    action: string;
    data: any;
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
}

export interface MoveRequestMessage extends BaseMessage {
    type: 'hero:move_request';
    heroId: string;
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

export type ClientMessage =
    | PlayerJoinMessage
    | PlayerLeaveMessage
    | PlayerActionMessage
    | ChatMessage
    | WorldRequestMessage
    | MoveRequestMessage;

export type ServerMessage =
    | PlayerJoinMessage
    | PlayerLeaveMessage
    | PlayerCountMessage
    | GameStateMessage
    | ChatMessage
    | WorldSnapshotMessage
    | WorldWelcomeMessage
    | PathUpdateMessage;

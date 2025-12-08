// Shared protocol definitions for client-server communication

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

export interface PlayerActionMessage extends BaseMessage {
  type: 'player:action';
  playerId: string;
  action: string;
  data: any;
}

// Union type for all possible messages
export type ClientMessage =
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | PlayerActionMessage;

export type ServerMessage =
  | GameStateMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage;

export type Message = ClientMessage | ServerMessage;

// Message type constants
export const MESSAGE_TYPES = {
  PLAYER_JOIN: 'player:join',
  PLAYER_LEAVE: 'player:leave',
  GAME_STATE: 'game:state',
  PLAYER_ACTION: 'player:action',
} as const;

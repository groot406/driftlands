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

// Union type for all possible messages
export type ClientMessage =
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | PlayerActionMessage
  | ChatMessage;

export type ServerMessage =
  | GameStateMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | PlayerCountMessage
  | ChatMessage;

export type Message = ClientMessage | ServerMessage;

// Message type constants
export const MESSAGE_TYPES = {
  PLAYER_JOIN: 'player:join',
  PLAYER_LEAVE: 'player:leave',
  PLAYER_COUNT: 'player:count',
  GAME_STATE: 'game:state',
  PLAYER_ACTION: 'player:action',
  CHAT_MESSAGE: 'chat:message',
} as const;

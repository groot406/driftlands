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
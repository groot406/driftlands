# Socket Communication System

This project has been restructured with a robust socket communication system featuring message routing, modular handlers, and a shared protocol.

## Architecture Overview

### Shared Protocol (`src/shared/protocol.ts`)
- Defines all message types and interfaces
- Ensures type safety between client and server
- Contains message constants and union types

### Client-Side Architecture

#### Message Router (`src/core/messageRouter.ts`)
- Routes incoming messages to appropriate handlers
- Type-safe message handling
- Centralized message distribution

#### Message Handlers (`src/core/messageHandlers.ts`)
- Initializes modular message handlers
- Coordinates handler setup
- Manages handler lifecycle

#### Individual Handlers (`src/core/handlers/`)
- `playerHandler.ts` - Handles player join/leave events
- `gameStateHandler.ts` - Handles game state updates
- Modular, focused handlers for specific message types

#### Socket Client (`src/core/socket.ts`)
- Basic connection management
- Message routing integration
- Clean socket.io setup

#### Game Client (`src/core/gameClient.ts`)
- High-level API for game interactions
- Helper functions for common operations
- Event listener setup

### Server-Side Architecture

#### Message Router (`server/src/messageRouter.ts`)
- Routes client messages to appropriate handlers
- Type-safe server-side message handling
- Utility functions for broadcasting

#### Message Handlers (`server/src/messageHandlers.ts`)
- Initializes modular server handlers
- Coordinates handler setup
- Manages handler lifecycle

#### Individual Server Handlers (`server/src/handlers/`)
- `playerHandler.ts` - Player connection and action management
- `gameStateHandler.ts` - Game state broadcasting and management
- Modular, focused server-side handlers

#### Main Server (`server/src/index.ts`)
- Express + Socket.IO setup
- Message routing integration
- Connection lifecycle management

## Usage Examples

### Basic Client Usage

```typescript
import { sendMessage } from './core/socket';
import { joinGame, sendPlayerAction } from './core/gameClient';

// Join a game
joinGame('player123', 'Alice');

// Send a player action
sendPlayerAction('player123', 'move', { x: 10, y: 20 });

// Send custom message
sendMessage({
  type: 'player:action',
  playerId: 'player123',
  action: 'chat',
  data: { message: 'Hello world!' },
  timestamp: Date.now()
});
```

### Setting Up Event Listeners

```typescript
import { clientMessageRouter } from './core/messageRouter';

// Listen for player events
clientMessageRouter.on('player:join', (message) => {
  console.log(\`\${message.playerName} joined!\`);
});

clientMessageRouter.on('game:state', (message) => {
  console.log('Game state updated:', message.state);
});
```

### Server-Side Message Handling

```typescript
import { serverMessageRouter } from './messageRouter';

// Add custom message handler
serverMessageRouter.on('player:action', (socket, message) => {
  console.log(\`Player \${message.playerId} performed: \${message.action}\`);
  
  // Broadcast to other players
  socket.broadcast.emit('message', {
    type: 'player:action',
    playerId: message.playerId,
    action: message.action,
    data: message.data,
    timestamp: Date.now()
  });
});
```

## Message Types


### Player Messages
- `player:join`: Player joining the game
- `player:leave`: Player leaving the game
- `player:action`: Player performing an action

### Game Messages
- `game:state`: Server broadcasting game state updates

## Features


### ✅ Type-Safe Message Routing
- Full TypeScript support
- Compile-time message validation
- Intellisense for message properties

### ✅ Extensible Handler System
- Easy to add new message types
- Modular handler organization
- Clean separation of concerns

### ✅ Connection Monitoring
- Real-time connection status
- Message history logging
- Player event tracking

## Development

### Running the System
```bash
npm run dev          # Start both client and server
npm run dev:client   # Start only client (port 5173)
npm run dev:server   # Start only server (port 3000)
```

### Adding New Message Types

1. **Add to Protocol** (`src/shared/protocol.ts`):
```typescript
export interface CustomMessage extends BaseMessage {
  type: 'custom:action';
  customData: any;
}

// Add to union types
export type ClientMessage = 
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | PlayerActionMessage
  | CustomMessage  // Add here
  | ...;
```

2. **Create Client Handler** (`src/core/handlers/customHandler.ts`):
```typescript
import { clientMessageRouter } from '../messageRouter';

export class CustomMessageHandler {
  init(): void {
    clientMessageRouter.on('custom:action', this.handleCustomAction.bind(this));
  }

  private handleCustomAction(message: CustomMessage): void {
    // Handle the message
  }
}
```

3. **Create Server Handler** (`server/src/handlers/customHandler.ts`):
```typescript
import { serverMessageRouter } from '../messageRouter';

export class ServerCustomHandler {
  init(): void {
    serverMessageRouter.on('custom:action', this.handleCustomAction.bind(this));
  }

  private handleCustomAction(socket: Socket, message: CustomMessage): void {
    // Handle the message
  }
}
```

## Configuration


### Server Port
Modify port in `server/src/index.ts` (default: 3000)

### Client URL
Automatic detection, or modify `URL` in `src/core/socket.ts`

## Components

### ConnectionMonitor Component
A ready-to-use Vue component that displays:
- Connection status
- Message history
- Player event tracking
- Connection controls

Usage:
```vue
<template>
  <ConnectionMonitor />
</template>

<script setup>
import ConnectionMonitor from './components/ConnectionMonitor.vue';
</script>
```

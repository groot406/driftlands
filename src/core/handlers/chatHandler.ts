import type { BaseMessage } from '../shared/protocol';
import { clientMessageRouter } from '../messageRouter';

// Example of adding a new message type
export interface ChatMessage extends BaseMessage {
  type: 'chat:message';
  playerId: string;
  message: string;
  channel: string;
}

// Example client-side chat handler
class ChatMessageHandler {
  init(): void {
    clientMessageRouter.on('chat:message', this.handleChatMessage.bind(this));
  }

  private handleChatMessage(message: ChatMessage): void {
    console.log(`[${message.channel}] Player ${message.playerId}: ${message.message}`);

    // Emit custom event for UI updates
    window.dispatchEvent(new CustomEvent('chat-message', {
      detail: {
        playerId: message.playerId,
        message: message.message,
        channel: message.channel
      }
    }));
  }
}

export const chatMessageHandler = new ChatMessageHandler();

// To use this handler:
// 1. Add ChatMessage to ClientMessage union type in protocol.ts
// 2. Import and initialize in messageHandlers.ts:
//    import { chatMessageHandler } from './handlers/chatHandler';
//    chatMessageHandler.init();

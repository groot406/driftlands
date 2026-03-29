import type { ChatMessage } from '../../shared/protocol';
import { clientMessageRouter } from '../messageRouter';
import { addChatMessage } from '../../store/chatStore';
import { addNotification } from '../../store/notificationStore';
import { getCurrentPlayerInfo } from '../socket';
import { isWindowActive, WINDOW_IDS } from '../windowManager';

// Client-side chat handler
class ChatMessageHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('chat:message', this.handleChatMessage.bind(this));
  }

  private handleChatMessage(message: ChatMessage): void {
    // Add to chat store
    addChatMessage({
      playerId: message.playerId,
      playerName: message.playerName,
      message: message.message
    });

    // Show notification if chat modal is not active and message is from another player
    const currentPlayer = getCurrentPlayerInfo();
    const isOwnMessage = currentPlayer && message.playerId === currentPlayer.id;

    if (!isOwnMessage && !isWindowActive(WINDOW_IDS.PLAYER_MODAL)) {
      addNotification({
        type: 'chat',
        title: 'New message',
        message: `${message.playerName}: ${message.message}`,
        duration: 4000
      });
    }
  }
}

export const chatMessageHandler = new ChatMessageHandler();

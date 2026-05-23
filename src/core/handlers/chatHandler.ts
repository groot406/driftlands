import type { ChatMessage } from '../../shared/protocol';
import { clientMessageRouter } from '../messageRouter';
import { addChatMessage, consumeOutgoingChatEcho, getIsPlayerModalOpen } from '../../store/chatStore';
import { addNotification } from '../../store/notificationStore';
import { playInterfaceSound } from '../../store/soundStore';

const INCOMING_CHAT_SOUND_COOLDOWN_MS = 800;
const INCOMING_CHAT_SOUND_VOLUME = 0.85;
let lastIncomingChatSoundAt = 0;

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
    const isOwnMessage = message.isOwnMessage ?? consumeOutgoingChatEcho(message);
    const isIncomingMessage = !isOwnMessage;
    const shouldMarkUnread = isIncomingMessage && !getIsPlayerModalOpen.value;

    // Add to chat store
    addChatMessage({
      playerId: message.playerId,
      playerName: message.playerName,
      message: message.message,
      isOwnMessage,
    }, { unread: shouldMarkUnread });

    // Show feedback for incoming chat even if the chat panel is currently open.
    if (isIncomingMessage) {
      this.playIncomingChatSound();
      addNotification({
        type: 'chat',
        title: 'New chat message',
        message: `${message.playerName}: ${message.message}`,
        duration: 6000
      });
    }
  }

  private playIncomingChatSound(): void {
    const now = Date.now();
    if (now - lastIncomingChatSoundAt < INCOMING_CHAT_SOUND_COOLDOWN_MS) {
      return;
    }

    lastIncomingChatSoundAt = now;
    void playInterfaceSound('chat-incoming.wav', { baseVolume: INCOMING_CHAT_SOUND_VOLUME });
  }
}

export const chatMessageHandler = new ChatMessageHandler();

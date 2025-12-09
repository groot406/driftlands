import type { GameStateMessage } from '../../shared/protocol';
import { clientMessageRouter } from '../messageRouter';

class GameStateHandler {
  init(): void {
    clientMessageRouter.on('game:state', this.handleGameState.bind(this));
  }

  private handleGameState(message: GameStateMessage): void {
    console.log('Received game state update:', message.state);

    window.dispatchEvent(new CustomEvent('game-state-update', {
      detail: { state: message.state }
    }));
  }
}

export const gameStateHandler = new GameStateHandler();


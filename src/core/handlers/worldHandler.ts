import type { WorldSnapshotMessage } from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {loadWorld} from '../world';

class WorldHandler {
    init(): void {
        clientMessageRouter.on('world:snapshot', this.handleWorldSnapshot.bind(this));
    }

    private handleWorldSnapshot(message: WorldSnapshotMessage): void {
        // Load tiles into client world
        loadWorld(message.tiles);
    }
}

export const worldHandler = new WorldHandler();


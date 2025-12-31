import type {TileUpdatedMessage, WorldSnapshotMessage} from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {loadWorld, updateTile} from '../world';
import {loadHeroes} from "../../store/heroStore";
import {loadTasks} from "../../store/taskStore";
class WorldHandler {
    init(): void {
        clientMessageRouter.on('world:snapshot', this.handleWorldSnapshot.bind(this));
        clientMessageRouter.on('tile:updated', this.handleTileUpdated.bind(this));
    }

    private handleWorldSnapshot(message: WorldSnapshotMessage): void {
        // Load tiles into client world
        loadWorld(message.tiles);
        loadHeroes(message.heroes);
        loadTasks(message.tasks);
    }

    private handleTileUpdated(message: TileUpdatedMessage): void {
        updateTile(message.tile)
    }
}

export const worldHandler = new WorldHandler();


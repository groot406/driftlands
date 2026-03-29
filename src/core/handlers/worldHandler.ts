import type {TileUpdatedMessage, WorldSnapshotMessage} from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {loadWorld, updateTile} from '../world';
import {loadHeroes} from "../../store/heroStore";
import {loadTasks} from "../../store/taskStore";
import {replaceInventory, replaceStorageInventories} from "../../store/resourceStore";
class WorldHandler {
    private initialized = false;

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        clientMessageRouter.on('world:snapshot', this.handleWorldSnapshot.bind(this));
        clientMessageRouter.on('tile:updated', this.handleTileUpdated.bind(this));
    }

    private handleWorldSnapshot(message: WorldSnapshotMessage): void {
        // Load tiles into client world
        loadWorld(message.tiles);
        loadHeroes(message.heroes);
        loadTasks(message.tasks);
        if (message.storages) {
            replaceStorageInventories(message.storages);
        } else if (message.resources) {
            replaceInventory(message.resources);
        }
    }

    private handleTileUpdated(message: TileUpdatedMessage): void {
        updateTile(message.tile)
    }
}

export const worldHandler = new WorldHandler();

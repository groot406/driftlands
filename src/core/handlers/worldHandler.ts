import type {TileUpdatedMessage, WorldSnapshotMessage, PopulationUpdateMessage} from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {loadWorld, updateTile} from '../world';
import {loadHeroes} from "../../store/heroStore";
import {loadTasks} from "../../store/taskStore";
import {replaceInventory, replaceStorageInventories} from "../../store/resourceStore";
import {loadPopulation, updatePopulation} from "../../store/clientPopulationStore";
class WorldHandler {
    private initialized = false;

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        clientMessageRouter.on('world:snapshot', this.handleWorldSnapshot.bind(this));
        clientMessageRouter.on('tile:updated', this.handleTileUpdated.bind(this));
        clientMessageRouter.on('population:update', this.handlePopulationUpdate.bind(this));
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
        if (message.population) {
            loadPopulation(message.population);
        }
    }

    private handleTileUpdated(message: TileUpdatedMessage): void {
        updateTile(message.tile)
    }

    private handlePopulationUpdate(message: PopulationUpdateMessage): void {
        updatePopulation(message.current, message.max, message.beds, message.hungerMs);
    }
}

export const worldHandler = new WorldHandler();

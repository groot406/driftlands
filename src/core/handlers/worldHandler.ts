import type { JobsUpdateMessage, TileUpdatedMessage, WorldSnapshotMessage, PopulationUpdateMessage } from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {loadWorld, updateTile} from '../world';
import {loadHeroes} from "../../store/heroStore";
import {loadTasks} from "../../store/taskStore";
import {replaceInventory, replaceStorageInventories} from "../../store/resourceStore";
import {loadPopulation, updatePopulation} from "../../store/clientPopulationStore";
import { loadWorkforce, updateWorkforce } from '../../store/clientJobStore';
class WorldHandler {
    private initialized = false;

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        clientMessageRouter.on('world:snapshot', this.handleWorldSnapshot.bind(this));
        clientMessageRouter.on('jobs:update', this.handleJobsUpdate.bind(this));
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
        if (message.jobs) {
            loadWorkforce(message.jobs);
        }
    }

    private handleTileUpdated(message: TileUpdatedMessage): void {
        updateTile(message.tile)
    }

    private handlePopulationUpdate(message: PopulationUpdateMessage): void {
        updatePopulation({
            current: message.current,
            max: message.max,
            beds: message.beds,
            hungerMs: message.hungerMs,
            supportCapacity: message.supportCapacity,
            activeTileCount: message.activeTileCount,
            inactiveTileCount: message.inactiveTileCount,
            pressureState: message.pressureState,
            settlements: message.settlements,
        });
    }

    private handleJobsUpdate(message: JobsUpdateMessage): void {
        updateWorkforce({
            availableWorkers: message.availableWorkers,
            assignedWorkers: message.assignedWorkers,
            idleWorkers: message.idleWorkers,
            sites: message.sites,
        });
    }
}

export const worldHandler = new WorldHandler();

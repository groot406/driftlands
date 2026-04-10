import type {
    JobsUpdateMessage,
    PopulationUpdateMessage,
    TileUpdatedMessage,
    WorldSnapshotChunkMessage,
    WorldSnapshotCompleteMessage,
    WorldSnapshotMessage,
    WorldSnapshotStartMessage,
} from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {loadWorld, updateTile} from '../world';
import {loadHeroes} from "../../store/heroStore";
import {loadTasks} from "../../store/taskStore";
import {replaceInventory, replaceStorageInventories} from "../../store/resourceStore";
import {loadPopulation, updatePopulation} from "../../store/clientPopulationStore";
import { loadWorkforce, updateWorkforce } from '../../store/clientJobStore';

interface PendingWorldSnapshot {
    snapshotId: string;
    totalTiles: number;
    totalChunks: number;
    tiles: WorldSnapshotMessage['tiles'];
    heroes: WorldSnapshotMessage['heroes'];
    tasks: WorldSnapshotMessage['tasks'];
    resources: WorldSnapshotMessage['resources'];
    storages: WorldSnapshotMessage['storages'];
    population: WorldSnapshotMessage['population'];
    jobs: WorldSnapshotMessage['jobs'];
}

class WorldHandler {
    private initialized = false;
    private pendingSnapshot: PendingWorldSnapshot | null = null;

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        clientMessageRouter.on('world:snapshot', this.handleWorldSnapshot.bind(this));
        clientMessageRouter.on('world:snapshot_start', this.handleWorldSnapshotStart.bind(this));
        clientMessageRouter.on('world:snapshot_chunk', this.handleWorldSnapshotChunk.bind(this));
        clientMessageRouter.on('world:snapshot_complete', this.handleWorldSnapshotComplete.bind(this));
        clientMessageRouter.on('jobs:update', this.handleJobsUpdate.bind(this));
        clientMessageRouter.on('tile:updated', this.handleTileUpdated.bind(this));
        clientMessageRouter.on('population:update', this.handlePopulationUpdate.bind(this));
    }

    private applyWorldSnapshot(message: Pick<WorldSnapshotMessage, 'tiles' | 'heroes' | 'tasks' | 'resources' | 'storages' | 'population' | 'jobs'>): void {
        loadWorld(message.tiles);
        loadHeroes(message.heroes);
        loadTasks(message.tasks);
        replaceStorageInventories(message.storages ?? []);
        if (message.resources) {
            replaceInventory(message.resources);
        }
        loadPopulation(message.population);
        loadWorkforce(message.jobs);
    }

    private handleWorldSnapshot(message: WorldSnapshotMessage): void {
        this.pendingSnapshot = null;
        this.applyWorldSnapshot(message);
    }

    private handleWorldSnapshotStart(message: WorldSnapshotStartMessage): void {
        this.pendingSnapshot = {
            snapshotId: message.snapshotId,
            totalTiles: message.totalTiles,
            totalChunks: message.totalChunks,
            tiles: [],
            heroes: message.heroes,
            tasks: message.tasks,
            resources: message.resources,
            storages: message.storages,
            population: message.population,
            jobs: message.jobs,
        };
    }

    private handleWorldSnapshotChunk(message: WorldSnapshotChunkMessage): void {
        if (!this.pendingSnapshot || this.pendingSnapshot.snapshotId !== message.snapshotId) {
            return;
        }

        this.pendingSnapshot.tiles.push(...message.tiles);
    }

    private handleWorldSnapshotComplete(message: WorldSnapshotCompleteMessage): void {
        if (!this.pendingSnapshot || this.pendingSnapshot.snapshotId !== message.snapshotId) {
            return;
        }

        const snapshot = this.pendingSnapshot;
        this.pendingSnapshot = null;

        if (snapshot.tiles.length !== snapshot.totalTiles) {
            console.warn(
                `Discarding incomplete world snapshot ${snapshot.snapshotId}: expected ${snapshot.totalTiles} tiles, received ${snapshot.tiles.length}.`,
            );
            return;
        }

        this.applyWorldSnapshot(snapshot);
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

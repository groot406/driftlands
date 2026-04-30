import type {
    JobsUpdateMessage,
    PopulationUpdateMessage,
    SettlersUpdateMessage,
    StudiesUpdateMessage,
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
import { loadStudyState, updateStudyState } from '../../store/clientStudyStore';
import { loadSettlers, updateSettlers } from '../../store/settlerStore';
import { clearScoutStoryHintsForTile } from '../../store/storyHintStore';
import { ensureHeroSelected } from '../../store/uiStore';

interface PendingWorldSnapshot {
    snapshotId: string;
    totalTiles: number;
    totalChunks: number;
    tiles: WorldSnapshotMessage['tiles'];
    heroes: WorldSnapshotMessage['heroes'];
    settlers: WorldSnapshotMessage['settlers'];
    tasks: WorldSnapshotMessage['tasks'];
    resources: WorldSnapshotMessage['resources'];
    settlementResources: WorldSnapshotMessage['settlementResources'];
    storages: WorldSnapshotMessage['storages'];
    population: WorldSnapshotMessage['population'];
    jobs: WorldSnapshotMessage['jobs'];
    studies: WorldSnapshotMessage['studies'];
    timestamp?: number;
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
        clientMessageRouter.on('studies:update', this.handleStudiesUpdate.bind(this));
        clientMessageRouter.on('settlers:update', this.handleSettlersUpdate.bind(this));
        clientMessageRouter.on('tile:updated', this.handleTileUpdated.bind(this));
        clientMessageRouter.on('population:update', this.handlePopulationUpdate.bind(this));
    }

    private applyWorldSnapshot(message: Pick<WorldSnapshotMessage, 'tiles' | 'heroes' | 'settlers' | 'tasks' | 'resources' | 'settlementResources' | 'storages' | 'population' | 'jobs' | 'studies' | 'timestamp'>): void {
        loadWorld(message.tiles);
        for (const tile of message.tiles) {
            if (tile.discovered) {
                clearScoutStoryHintsForTile(tile.q, tile.r);
            }
        }
        loadHeroes(message.heroes);
        ensureHeroSelected(false);
        loadSettlers(message.settlers ?? [], message.timestamp);
        loadTasks(message.tasks);
        const storages = message.storages ?? [];
        replaceStorageInventories(storages);
        if (storages.length === 0 && message.resources) {
            replaceInventory(message.resources);
        }
        loadPopulation(message.population);
        loadWorkforce(message.jobs);
        loadStudyState(message.studies);
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
            settlers: message.settlers,
            tasks: message.tasks,
            resources: message.resources,
            settlementResources: message.settlementResources ?? [],
            storages: message.storages,
            population: message.population,
            jobs: message.jobs,
            studies: message.studies,
            timestamp: message.timestamp,
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
        updateTile(message.tile);
        if (message.tile.discovered) {
            clearScoutStoryHintsForTile(message.tile.q, message.tile.r);
        }
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

    private handleStudiesUpdate(message: StudiesUpdateMessage): void {
        updateStudyState(message.studies);
    }

    private handleSettlersUpdate(message: SettlersUpdateMessage): void {
        updateSettlers(message.settlers, message.timestamp);
    }
}

export const worldHandler = new WorldHandler();

import type {
    CalamityEventMessage,
    JobsUpdateMessage,
    PopulationUpdateMessage,
    SettlersUpdateMessage,
    StudiesUpdateMessage,
    TestUpdateMessage,
    TileUpdatedMessage,
    WorldSnapshotChunkMessage,
    WorldSnapshotCompleteMessage,
    WorldSnapshotMessage,
    WorldSnapshotStartMessage,
} from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {loadWorld, tileIndex, updateTile} from '../world';
import {loadHeroes} from "../../store/heroStore";
import {loadTasks} from "../../store/taskStore";
import {replaceInventory, replaceStorageInventories} from "../../store/resourceStore";
import {loadPopulation, updatePopulation} from "../../store/clientPopulationStore";
import { loadWorkforce, updateWorkforce } from '../../store/clientJobStore';
import { loadStudyState, updateStudyState } from '../../store/clientStudyStore';
import { loadSettlers, updateSettlers } from '../../store/settlerStore';
import { clearScoutStoryHintsForTile } from '../../store/storyHintStore';
import { loadTestModeSettings } from '../../shared/game/testMode.ts';
import { setServerDebugModeEnabled } from '../../store/serverConfigStore.ts';
import { addNotification } from '../../store/notificationStore';
import { openCalamityReport } from '../../store/calamityEventStore.ts';
import { currentPlayerSettlementId } from '../../store/settlementStartStore.ts';
import { isWatchtowerTile } from '../../shared/game/military.ts';
import { setWorldGenerationSpawnSafetyEnabled } from '../worldGeneration';
import { replaceMarketOverview } from '../../store/marketStore.ts';
import { replaceShipOrderOverview } from '../../store/shipOrderStore.ts';

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
    market: WorldSnapshotMessage['market'];
    shipOrders: WorldSnapshotMessage['shipOrders'];
    debugModeEnabled?: boolean;
    spawnSafetyEnabled?: boolean;
    timestamp?: number;
}

class WorldHandler {
    private initialized = false;
    private pendingSnapshot: PendingWorldSnapshot | null = null;

    private refreshHeroSelection(): void {
        void import('../../store/uiStore').then(({ ensureHeroSelected }) => {
            ensureHeroSelected(false);
        });
    }

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
        clientMessageRouter.on('test:update', this.handleTestModeUpdate.bind(this));
        clientMessageRouter.on('tile:updated', this.handleTileUpdated.bind(this));
        clientMessageRouter.on('population:update', this.handlePopulationUpdate.bind(this));
        clientMessageRouter.on('calamity:event', this.handleCalamityEvent.bind(this));
    }

    private applyWorldSnapshot(message: Pick<WorldSnapshotMessage, 'tiles' | 'heroes' | 'settlers' | 'tasks' | 'resources' | 'settlementResources' | 'storages' | 'population' | 'jobs' | 'studies' | 'market' | 'shipOrders' | 'timestamp' | 'debugModeEnabled' | 'spawnSafetyEnabled'>): void {
        setServerDebugModeEnabled((message as WorldSnapshotMessage).debugModeEnabled);
        setWorldGenerationSpawnSafetyEnabled((message as WorldSnapshotMessage).spawnSafetyEnabled === true);
        loadWorld(message.tiles);
        for (const tile of message.tiles) {
            if (tile.discovered) {
                clearScoutStoryHintsForTile(tile.q, tile.r);
            }
        }
        loadHeroes(message.heroes);
        this.refreshHeroSelection();
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
        if (message.market) {
            replaceMarketOverview(message.market);
        }
        replaceShipOrderOverview(message.shipOrders);
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
            market: message.market,
            shipOrders: message.shipOrders,
            debugModeEnabled: message.debugModeEnabled,
            spawnSafetyEnabled: message.spawnSafetyEnabled,
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
        const previousTile = message.tile?.id ? { ...(tileIndex[message.tile.id] ?? {}) } : null;
        updateTile(message.tile);
        if (message.tile.discovered) {
            clearScoutStoryHintsForTile(message.tile.q, message.tile.r);
        }

        const settlementId = currentPlayerSettlementId.value;
        if (settlementId && message.tile.id === settlementId && message.tile.terrain === 'towncenter') {
            const previousTarget = previousTile?.raidTargetTileId ?? null;
            const nextTarget = message.tile.raidTargetTileId ?? null;
            if (previousTarget !== nextTarget) {
                const previousTargetTile = previousTarget ? tileIndex[previousTarget] ?? null : null;
                const raidSucceeded = !nextTarget
                    && !!previousTarget
                    && previousTargetTile?.ownerSettlementId === settlementId;
                addNotification({
                    type: 'settlement',
                    title: nextTarget ? 'Raid underway' : raidSucceeded ? 'Watchtower captured' : 'Raid cancelled',
                    message: nextTarget
                        ? 'Your committed guards are marching on the selected border watchtower.'
                        : raidSucceeded
                            ? 'Your raid succeeded and the target watchtower is now part of your border.'
                            : 'Your border raid order has been withdrawn.',
                    duration: 3200,
                });
            }
            const previousBlockedReason = previousTile?.raidBlockedReason ?? null;
            const nextBlockedReason = message.tile.raidBlockedReason ?? null;
            if (previousBlockedReason !== nextBlockedReason && nextBlockedReason) {
                addNotification({
                    type: 'settlement',
                    title: 'Raid blocked',
                    message: nextBlockedReason,
                    duration: 3800,
                });
            }
        }

        if (!settlementId || !isWatchtowerTile(message.tile)) {
            return;
        }

        const nowUnderAttack = message.tile.ownerSettlementId === settlementId
            && !!message.tile.towerAttackerSettlementId
            && (previousTile?.towerAttackerSettlementId ?? null) !== (message.tile.towerAttackerSettlementId ?? null);
        if (nowUnderAttack) {
            addNotification({
                type: 'settlement',
                title: 'Watchtower under attack',
                message: 'A border watchtower is taking hostile pressure. Assign guards or reinforce it before the capture bar fills.',
                duration: 4200,
            });
        }

        const wasOwnedByPlayer = previousTile?.ownerSettlementId === settlementId;
        const isOwnedByPlayer = message.tile.ownerSettlementId === settlementId;
        if (wasOwnedByPlayer && !isOwnedByPlayer) {
            addNotification({
                type: 'settlement',
                title: 'Watchtower captured',
                message: 'An exposed border tower changed hands. Rebuild pressure or reinforce your next line.',
                duration: 4800,
            });
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

    private handleCalamityEvent(message: CalamityEventMessage): void {
        const settlementId = currentPlayerSettlementId.value;
        if (message.settlementId && settlementId && message.settlementId !== settlementId) {
            return;
        }

        addNotification({
            type: 'calamity',
            title: message.title,
            message: message.message,
            duration: message.severity === 'severe' ? 7200 : 5600,
        });
        openCalamityReport(message);
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

    private handleTestModeUpdate(message: TestUpdateMessage): void {
        loadTestModeSettings(message.settings);
    }
}

export const worldHandler = new WorldHandler();

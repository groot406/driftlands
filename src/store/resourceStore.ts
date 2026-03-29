import type {Tile} from "../core/types/Tile.ts";
import type {ResourceType} from "../core/types/Resource.ts";
import { getBuildingDefinitionForTile } from '../shared/buildings/registry.ts';
import { getStorageCapacity, type StorageKind, type StorageSnapshot } from '../shared/game/storage.ts';
import { tileIndex } from '../core/world.ts';
import { reactive, ref } from 'vue';

const RESOURCE_TYPES: ResourceType[] = [
    'wood',
    'ore',
    'stone',
    'food',
    'crystal',
    'artifact',
    'water',
    'grain',
];

function createEmptyInventory(): Partial<Record<ResourceType, number>> {
    return {
        wood: 0,
        ore: 0,
        stone: 0,
        food: 0,
        crystal: 0,
        artifact: 0,
        water: 0,
        grain: 0,
    };
}

function cloneInventory(values: Partial<Record<ResourceType, number>> | undefined) {
    const inventory = createEmptyInventory();

    for (const resourceType of RESOURCE_TYPES) {
        inventory[resourceType] = Math.max(0, values?.[resourceType] ?? 0);
    }

    return inventory;
}

function resolveStorageKind(tile: Tile | null | undefined): StorageKind | null {
    if (!tile) {
        return null;
    }

    if (tile.terrain === 'towncenter') {
        return 'towncenter';
    }

    const building = getBuildingDefinitionForTile(tile);
    if (!building?.providesWarehouse) {
        return null;
    }

    return building.key === 'supplyDepot' ? 'depot' : 'warehouse';
}

function clearReactiveRecord<T>(record: Record<string, T>) {
    for (const key of Object.keys(record)) {
        delete record[key];
    }
}

function recomputeAggregateInventory() {
    for (const resourceType of RESOURCE_TYPES) {
        resourceInventory[resourceType] = 0;
    }

    for (const snapshot of Object.values(storageInventories)) {
        for (const resourceType of RESOURCE_TYPES) {
            resourceInventory[resourceType] = (resourceInventory[resourceType] ?? 0) + (snapshot.resources[resourceType] ?? 0);
        }
    }
}

function writeAggregateInventory(values: Partial<Record<ResourceType, number>>) {
    for (const resourceType of RESOURCE_TYPES) {
        resourceInventory[resourceType] = Math.max(0, values[resourceType] ?? 0);
    }
}

function getStorageUsedCapacityInternal(snapshot: StorageSnapshot) {
    return RESOURCE_TYPES.reduce((sum, resourceType) => sum + (snapshot.resources[resourceType] ?? 0), 0);
}

function ensureStorageSnapshotForTileInternal(tile: Tile | null | undefined): StorageSnapshot | null {
    const kind = resolveStorageKind(tile);
    if (!tile || !kind) {
        return null;
    }

    let snapshot = storageInventories[tile.id];
    if (!snapshot) {
        snapshot = {
            tileId: tile.id,
            kind,
            capacity: getStorageCapacity(kind),
            resources: createEmptyInventory(),
        };
        storageInventories[tile.id] = snapshot;
    } else {
        snapshot.kind = kind;
        snapshot.capacity = getStorageCapacity(kind);
    }

    return snapshot;
}

function getStorageCapacityForTileId(tileId: string) {
    const kind = resolveStorageKind(tileIndex[tileId]);
    return kind ? getStorageCapacity(kind) : 0;
}

// Aggregate view of all delivered resources across every local storage.
export const resourceInventory: Partial<Record<ResourceType, number>> = reactive(createEmptyInventory());

// Per-storage inventories keyed by storage tile id.
export const storageInventories: Record<string, StorageSnapshot> = reactive({});

// Version ref for watchers (incremented on any inventory mutation)
export const resourceVersion = ref(0);

export function resetResourceState() {
    clearReactiveRecord(storageInventories);
    writeAggregateInventory(createEmptyInventory());
    resourceVersion.value++;
}

export function replaceStorageInventories(storages: StorageSnapshot[]) {
    clearReactiveRecord(storageInventories);

    for (const storage of storages) {
        storageInventories[storage.tileId] = {
            tileId: storage.tileId,
            kind: storage.kind,
            capacity: storage.capacity,
            resources: cloneInventory(storage.resources),
        };
    }

    recomputeAggregateInventory();
    resourceVersion.value++;
}

export function listStorageSnapshots(): StorageSnapshot[] {
    return Object.values(storageInventories).map((storage) => ({
        tileId: storage.tileId,
        kind: storage.kind,
        capacity: storage.capacity,
        resources: cloneInventory(storage.resources),
    }));
}

export function ensureStorageSnapshotForTile(tile: Tile | null | undefined) {
    return ensureStorageSnapshotForTileInternal(tile);
}

export function getStorageResourceAmount(tileId: string, type: ResourceType) {
    return storageInventories[tileId]?.resources[type] ?? 0;
}

export function getStorageUsedCapacity(tileId: string) {
    const snapshot = storageInventories[tileId];
    if (!snapshot) {
        return 0;
    }

    return getStorageUsedCapacityInternal(snapshot);
}

export function getStorageFreeCapacity(tileId: string) {
    const snapshot = storageInventories[tileId];
    if (!snapshot) {
        return getStorageCapacityForTileId(tileId);
    }

    return Math.max(0, snapshot.capacity - getStorageUsedCapacityInternal(snapshot));
}

export function depositResourceToStorage(tileId: string, type: ResourceType, amount: number = 1) {
    if (amount <= 0) return 0;

    const snapshot = ensureStorageSnapshotForTileInternal(tileIndex[tileId]);
    if (!snapshot) {
        return 0;
    }

    const amountToStore = Math.min(amount, Math.max(0, snapshot.capacity - getStorageUsedCapacityInternal(snapshot)));
    if (amountToStore <= 0) {
        return 0;
    }

    snapshot.resources[type] = (snapshot.resources[type] ?? 0) + amountToStore;
    recomputeAggregateInventory();
    resourceVersion.value++;
    return amountToStore;
}

export function withdrawResourceFromStorage(tileId: string, type: ResourceType, amount: number = 1) {
    if (amount <= 0) return 0;

    const snapshot = ensureStorageSnapshotForTileInternal(tileIndex[tileId]);
    if (!snapshot) {
        return 0;
    }

    const available = snapshot.resources[type] ?? 0;
    const amountToTake = Math.min(amount, available);
    if (amountToTake <= 0) {
        return 0;
    }

    snapshot.resources[type] = Math.max(0, available - amountToTake);
    recomputeAggregateInventory();
    resourceVersion.value++;
    return amountToTake;
}

// Legacy aggregate helpers kept as a fallback for systems that do not specify a storage tile.
export function depositResource(type: ResourceType, amount: number = 1) {
    if (amount <= 0) return;

    const originStorage = ensureStorageSnapshotForTileInternal(tileIndex['0,0']);
    if (originStorage) {
        depositResourceToStorage(originStorage.tileId, type, amount);
        return;
    }

    resourceInventory[type] = (resourceInventory[type] ?? 0) + amount;
    resourceVersion.value++;
}

export function withdrawResource(type: ResourceType, amount: number = 1) {
    if (amount <= 0) return;

    const originStorage = ensureStorageSnapshotForTileInternal(tileIndex['0,0']);
    if (originStorage) {
        withdrawResourceFromStorage(originStorage.tileId, type, amount);
        return;
    }

    const current = resourceInventory[type] ?? 0;
    resourceInventory[type] = Math.max(0, current - amount);
    resourceVersion.value++;
}

export function setResourceAmount(type: ResourceType, amount: number) {
    const next = createEmptyInventory();
    next[type] = Math.max(0, amount);
    replaceInventory(next);
}

export function replaceInventory(values: Partial<Record<ResourceType, number>>) {
    clearReactiveRecord(storageInventories);
    writeAggregateInventory(values);
    resourceVersion.value++;
}

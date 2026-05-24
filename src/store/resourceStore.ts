import type {Tile} from "../core/types/Tile.ts";
import type {ResourceAmount, ResourceType} from "../core/types/Resource.ts";
import { getStorageKindForBuildingTile } from '../shared/buildings/state.ts';
import { listBuildingDefinitions } from '../shared/buildings/registry.ts';
import { getTileSettlementId } from '../shared/game/settlement';
import { canStorageKindStoreResource, getStorageCapacity, type StorageKind, type StorageSnapshot } from '../shared/game/storage.ts';
import {
    isUnlimitedResourcesEnabled,
    testModeSettings,
    TEST_MODE_VIRTUAL_RESOURCE_AMOUNT,
} from '../shared/game/testMode.ts';
import { tileIndex } from '../core/world.ts';
import { getVariantSet, terrainPositions } from '../core/terrainRegistry.ts';
import { reactive, ref } from 'vue';

const RESOURCE_TYPES: ResourceType[] = [
    'wood',
    'ore',
    'stone',
    'tools',
    'weapons',
    'food',
    'fish',
    'bread',
    'meat',
    'beer',
    'wine',
    'water',
    'grain',
    'hops',
    'grapes',
    'water_lily',
    'sand',
    'glass',
    'tea',
    'pottery',
    'spices',
    'silk',
];

function createEmptyInventory(): Partial<Record<ResourceType, number>> {
    return {
        wood: 0,
        ore: 0,
        stone: 0,
        tools: 0,
        weapons: 0,
        food: 0,
        fish: 0,
        bread: 0,
        meat: 0,
        beer: 0,
        wine: 0,
        water: 0,
        grain: 0,
        hops: 0,
        grapes: 0,
        water_lily: 0,
        sand: 0,
        glass: 0,
        tea: 0,
        pottery: 0,
        spices: 0,
        silk: 0,
    };
}

function cloneInventory(values: Partial<Record<ResourceType, number>> | undefined) {
    const inventory = createEmptyInventory();

    for (const resourceType of RESOURCE_TYPES) {
        inventory[resourceType] = Math.max(0, values?.[resourceType] ?? 0);
    }

    return inventory;
}

function withUnlimitedResources(values: Partial<Record<ResourceType, number>> | undefined) {
    const inventory = cloneInventory(values);
    if (!isUnlimitedResourcesEnabled(testModeSettings)) {
        return inventory;
    }

    for (const resourceType of RESOURCE_TYPES) {
        inventory[resourceType] = Math.max(inventory[resourceType] ?? 0, TEST_MODE_VIRTUAL_RESOURCE_AMOUNT);
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

    return getStorageKindForBuildingTile(tile);
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

    clearReactiveRecord(settlementResourceInventories);

    for (const snapshot of Object.values(storageInventories)) {
        const settlementId = getStorageSettlementId(snapshot.tileId);
        const settlementInventory = settlementId ? ensureSettlementResourceInventory(settlementId) : null;
        for (const resourceType of RESOURCE_TYPES) {
            const amount = snapshot.resources[resourceType] ?? 0;
            resourceInventory[resourceType] = (resourceInventory[resourceType] ?? 0) + amount;
            if (settlementInventory) {
                settlementInventory.resources[resourceType] = (settlementInventory.resources[resourceType] ?? 0) + amount;
            }
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

function getStorageSettlementId(tileId: string) {
    const tile = tileIndex[tileId];
    return getTileSettlementId(tile);
}

function ensureSettlementResourceInventory(settlementId: string): SettlementResourceInventorySnapshot {
    let snapshot = settlementResourceInventories[settlementId];
    if (!snapshot) {
        snapshot = {
            settlementId,
            resources: createEmptyInventory(),
        };
        settlementResourceInventories[settlementId] = snapshot;
    }

    return snapshot;
}

export interface SettlementResourceInventorySnapshot {
    settlementId: string;
    resources: Partial<Record<ResourceType, number>>;
}

// Aggregate view of all delivered resources across every local storage.
export const resourceInventory: Partial<Record<ResourceType, number>> = reactive(createEmptyInventory());

// Per-storage inventories keyed by storage tile id.
export const storageInventories: Record<string, StorageSnapshot> = reactive({});

// Per-settlement aggregate inventories keyed by settlement id.
export const settlementResourceInventories: Record<string, SettlementResourceInventorySnapshot> = reactive({});

// Version ref for watchers (incremented on any inventory mutation)
export const resourceVersion = ref(0);

export function resetResourceState() {
    clearReactiveRecord(storageInventories);
    clearReactiveRecord(settlementResourceInventories);
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

export function listSettlementResourceSnapshots(): SettlementResourceInventorySnapshot[] {
    return Object.values(settlementResourceInventories)
        .sort((a, b) => a.settlementId.localeCompare(b.settlementId))
        .map((settlement) => ({
            settlementId: settlement.settlementId,
            resources: cloneInventory(settlement.resources),
        }));
}

export function getSettlementResourceInventory(settlementId: string | null | undefined) {
    return getEffectiveResourceInventory(settlementId);
}

export function getEffectiveResourceInventory(settlementId: string | null | undefined = null) {
    if (!settlementId) {
        return withUnlimitedResources(resourceInventory);
    }

    return withUnlimitedResources(settlementResourceInventories[settlementId]?.resources);
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
    if (!canStorageKindStoreResource(snapshot.kind, type)) {
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

export interface StorageResourceTransfer {
    storageTileId: string;
    amount: number;
}

function compareStorageWithdrawalPriority(a: string, b: string) {
    const aTile = tileIndex[a];
    const bTile = tileIndex[b];
    const aPriority = aTile?.terrain === 'towncenter' ? 0 : 1;
    const bPriority = bTile?.terrain === 'towncenter' ? 0 : 1;

    if (aPriority !== bPriority) {
        return aPriority - bPriority;
    }

    return a.localeCompare(b);
}

function collectPotentialStorageIds(): string[] {
    const storageIds = new Set<string>(Object.keys(storageInventories));

    for (const tileId of terrainPositions.towncenter) {
        storageIds.add(tileId);
    }

    for (const building of listBuildingDefinitions()) {
        if (!building.providesWarehouse) {
            continue;
        }

        for (const variantKey of building.variantKeys) {
            for (const tileId of getVariantSet(variantKey)) {
                storageIds.add(tileId);
            }
        }
    }

    return Array.from(storageIds);
}

function getPrioritizedStorageIdsForSettlement(settlementId: string | null | undefined) {
    return collectPotentialStorageIds()
        .filter((storageTileId) => {
            const tile = tileIndex[storageTileId];
            if (settlementId && getTileSettlementId(tile) !== settlementId) {
                return false;
            }

            return !!ensureStorageSnapshotForTileInternal(tile);
        })
        .sort(compareStorageWithdrawalPriority);
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

export function withdrawResourceAcrossStorages(type: ResourceType, amount: number = 1): StorageResourceTransfer[] {
    return withdrawResourceAcrossStoragesForSettlement(null, type, amount);
}

export function withdrawResourceAcrossStoragesForSettlement(
    settlementId: string | null | undefined,
    type: ResourceType,
    amount: number = 1,
): StorageResourceTransfer[] {
    if (amount <= 0) {
        return [];
    }

    const transfers: StorageResourceTransfer[] = [];
    let remaining = amount;

    const prioritizedStorageIds = getPrioritizedStorageIdsForSettlement(settlementId);
    for (const storageTileId of prioritizedStorageIds) {
        if (remaining <= 0) {
            break;
        }

        const withdrawnAmount = withdrawResourceFromStorage(storageTileId, type, remaining);
        if (withdrawnAmount <= 0) {
            continue;
        }

        transfers.push({
            storageTileId,
            amount: withdrawnAmount,
        });
        remaining -= withdrawnAmount;
    }

    if (transfers.length > 0) {
        return transfers;
    }

    const current = settlementId
        ? settlementResourceInventories[settlementId]?.resources[type] ?? 0
        : resourceInventory[type] ?? 0;
    const withdrawnAmount = Math.min(amount, current);
    if (withdrawnAmount <= 0) {
        return [];
    }

    if (settlementId) {
        ensureSettlementResourceInventory(settlementId).resources[type] = Math.max(0, current - withdrawnAmount);
    } else {
        resourceInventory[type] = Math.max(0, current - withdrawnAmount);
    }
    resourceVersion.value++;
    return [{
        storageTileId: settlementId ?? '0,0',
        amount: withdrawnAmount,
    }];
}

export function planResourceWithdrawalsAcrossStorages(type: ResourceType, amount: number = 1): StorageResourceTransfer[] {
    return planResourceWithdrawalsAcrossStoragesForSettlement(null, type, amount);
}

export function planResourceWithdrawalsAcrossStoragesForSettlement(
    settlementId: string | null | undefined,
    type: ResourceType,
    amount: number = 1,
): StorageResourceTransfer[] {
    if (amount <= 0) {
        return [];
    }

    const transfers: StorageResourceTransfer[] = [];
    let remaining = amount;
    const prioritizedStorageIds = getPrioritizedStorageIdsForSettlement(settlementId);

    for (const storageTileId of prioritizedStorageIds) {
        if (remaining <= 0) {
            break;
        }

        const available = storageInventories[storageTileId]?.resources[type] ?? 0;
        const amountToTake = Math.min(remaining, available);
        if (amountToTake <= 0) {
            continue;
        }

        transfers.push({
            storageTileId,
            amount: amountToTake,
        });
        remaining -= amountToTake;
    }

    if (transfers.length > 0) {
        return transfers;
    }

    const current = settlementId
        ? settlementResourceInventories[settlementId]?.resources[type] ?? 0
        : resourceInventory[type] ?? 0;
    const amountToTake = Math.min(amount, current);
    if (amountToTake <= 0) {
        return [];
    }

    return [{
        storageTileId: settlementId ?? '0,0',
        amount: amountToTake,
    }];
}

export function planResourceDepositsAcrossStoragesForSettlement(
    settlementId: string | null | undefined,
    type: ResourceType,
    amount: number = 1,
): StorageResourceTransfer[] {
    if (amount <= 0) {
        return [];
    }

    const transfers: StorageResourceTransfer[] = [];
    let remaining = amount;

    for (const storageTileId of getPrioritizedStorageIdsForSettlement(settlementId)) {
        if (remaining <= 0) {
            break;
        }

        const snapshot = storageInventories[storageTileId];
        if (!snapshot || !canStorageKindStoreResource(snapshot.kind, type)) {
            continue;
        }

        const amountToStore = Math.min(remaining, Math.max(0, snapshot.capacity - getStorageUsedCapacityInternal(snapshot)));
        if (amountToStore <= 0) {
            continue;
        }

        transfers.push({
            storageTileId,
            amount: amountToStore,
        });
        remaining -= amountToStore;
    }

    return transfers;
}

export function depositResourceAcrossStoragesForSettlement(
    settlementId: string | null | undefined,
    type: ResourceType,
    amount: number = 1,
): StorageResourceTransfer[] {
    const plannedTransfers = planResourceDepositsAcrossStoragesForSettlement(settlementId, type, amount);
    const plannedAmount = plannedTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    if (plannedAmount < amount) {
        return [];
    }

    const transfers: StorageResourceTransfer[] = [];
    for (const transfer of plannedTransfers) {
        const depositedAmount = depositResourceToStorage(transfer.storageTileId, type, transfer.amount);
        if (depositedAmount > 0) {
            transfers.push({
                storageTileId: transfer.storageTileId,
                amount: depositedAmount,
            });
        }
    }

    return transfers;
}

/**
 * Swap resources at a storage tile: deposit one resource type and withdraw another.
 * The swap is capacity-neutral (withdraw first, then deposit into freed space).
 * Since a hero can only carry one resource type, only a full swap (covering the
 * entire deposit amount) is performed. Returns the result, or null if no
 * resource type could fully cover the deposit amount.
 */
export function swapResourceAtStorage(
    tileId: string,
    depositType: ResourceType,
    depositAmount: number,
    withdrawType?: ResourceType,
): { deposited: number; withdrawn: ResourceAmount | null } {
    if (depositAmount <= 0) return { deposited: 0, withdrawn: null };

    const snapshot = ensureStorageSnapshotForTileInternal(tileIndex[tileId]);
    if (!snapshot) return { deposited: 0, withdrawn: null };
    if (!canStorageKindStoreResource(snapshot.kind, depositType)) {
        return { deposited: 0, withdrawn: null };
    }

    // Determine which resource type to withdraw
    let targetType: ResourceType | null = withdrawType ?? null;
    if (!targetType) {
        // Find the resource type with the smallest stock that still fully covers
        // the deposit amount (tightest fit), so we don't drain the most plentiful
        // resource unnecessarily.
        let bestAmount = Infinity;

        for (const rt of RESOURCE_TYPES) {
            if (rt === depositType) continue;
            const available = snapshot.resources[rt] ?? 0;
            if (available >= depositAmount && available < bestAmount) {
                bestAmount = available;
                targetType = rt;
            }
        }
    }

    if (!targetType) return { deposited: 0, withdrawn: null };

    const availableToWithdraw = snapshot.resources[targetType] ?? 0;
    if (availableToWithdraw < depositAmount) return { deposited: 0, withdrawn: null };

    // Withdraw first (frees capacity), then deposit (uses freed capacity)
    snapshot.resources[targetType] = Math.max(0, availableToWithdraw - depositAmount);
    snapshot.resources[depositType] = (snapshot.resources[depositType] ?? 0) + depositAmount;

    recomputeAggregateInventory();
    resourceVersion.value++;

    return {
        deposited: depositAmount,
        withdrawn: { type: targetType, amount: depositAmount },
    };
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
    return withdrawResourceAcrossStorages(type, amount)
        .reduce((sum, transfer) => sum + transfer.amount, 0);
}

export function setResourceAmount(type: ResourceType, amount: number) {
    const next = createEmptyInventory();
    next[type] = Math.max(0, amount);
    replaceInventory(next);
}

export function replaceInventory(values: Partial<Record<ResourceType, number>>) {
    clearReactiveRecord(storageInventories);
    clearReactiveRecord(settlementResourceInventories);
    writeAggregateInventory(values);
    resourceVersion.value++;
}

import type { ResourceType } from '../../core/types/Resource.ts';

export type StorageKind = 'towncenter' | 'warehouse' | 'depot';

export interface StorageSnapshot {
    tileId: string;
    kind: StorageKind;
    capacity: number;
    resources: Partial<Record<ResourceType, number>>;
}

export const STORAGE_CAPACITY_BY_KIND: Record<StorageKind, number> = {
    towncenter: 240,
    warehouse: 160,
    depot: 80,
};

export function getStorageCapacity(kind: StorageKind): number {
    return STORAGE_CAPACITY_BY_KIND[kind];
}

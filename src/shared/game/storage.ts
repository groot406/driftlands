import type { ResourceType } from '../../core/types/Resource.ts';
import { getResourceDefinition, type ResourceGroup } from './resourceDefinitions.ts';

export type StorageKind =
    | 'towncenter'
    | 'warehouse'
    | 'depot'
    | 'food_storehouse'
    | 'materials_yard'
    | 'crop_silo'
    | 'crafted_goods_storehouse';

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
    food_storehouse: 120,
    materials_yard: 120,
    crop_silo: 120,
    crafted_goods_storehouse: 120,
};

export const STORAGE_GROUP_BY_KIND: Partial<Record<StorageKind, ResourceGroup>> = {
    food_storehouse: 'food',
    materials_yard: 'materials',
    crop_silo: 'crops',
    crafted_goods_storehouse: 'crafted_goods',
};

export function getStorageCapacity(kind: StorageKind): number {
    return STORAGE_CAPACITY_BY_KIND[kind];
}

export function formatStorageAmount(amount: number): string {
    if (!Number.isFinite(amount)) {
        return '0';
    }

    const roundedInteger = Math.round(amount);
    if (Math.abs(amount - roundedInteger) < 0.000001) {
        return `${roundedInteger}`;
    }

    const roundedHundredths = Math.round((amount + Number.EPSILON) * 100) / 100;
    return Number(roundedHundredths.toFixed(2)).toString();
}

export function getStorageAcceptedGroup(kind: StorageKind): ResourceGroup | null {
    return STORAGE_GROUP_BY_KIND[kind] ?? null;
}

export function canStorageKindStoreResource(kind: StorageKind, resourceType: ResourceType) {
    const acceptedGroup = getStorageAcceptedGroup(kind);
    return !acceptedGroup || getResourceDefinition(resourceType).group === acceptedGroup;
}

export function getStorageKindLabel(kind: StorageKind) {
    switch (kind) {
        case 'towncenter':
            return 'Town Center';
        case 'warehouse':
            return 'Warehouse';
        case 'depot':
            return 'Supply Depot';
        case 'food_storehouse':
            return 'Food Storehouse';
        case 'materials_yard':
            return 'Materials Yard';
        case 'crop_silo':
            return 'Crop Silo';
        case 'crafted_goods_storehouse':
            return 'Crafted Goods Storehouse';
    }
}

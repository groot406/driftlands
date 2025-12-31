import type {ResourceType} from "../core/types/Resource.ts";

// Reactive inventory of delivered (warehouse-deposited) resources.
export const resourceInventory: Partial<Record<ResourceType, number>> = {
    wood: 0,
    ore: 0,
    stone: 0,
    food: 0,
    crystal: 0,
    artifact: 0,
};

// Version ref for watchers (incremented on any inventory mutation)
export let resourceVersion = 0;

export function depositResource(type: ResourceType, amount: number = 1) {
    if (amount <= 0) return;

    resourceInventory[type] = (resourceInventory[type] ?? 0) + amount;
    resourceVersion++;
}

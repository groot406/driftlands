import type {ResourceType} from "../core/types/Resource.ts";
import { reactive, ref } from 'vue';

// Reactive inventory of delivered (warehouse-deposited) resources.
export const resourceInventory: Partial<Record<ResourceType, number>> = reactive({
    wood: 0,
    ore: 0,
    stone: 0,
    food: 0,
    crystal: 0,
    artifact: 0,
});

// Version ref for watchers (incremented on any inventory mutation)
export const resourceVersion = ref(0);

export function depositResource(type: ResourceType, amount: number = 1) {
    if (amount <= 0) return;

    resourceInventory[type] = (resourceInventory[type] ?? 0) + amount;
    resourceVersion.value++;
}

export function setResourceAmount(type: ResourceType, amount: number) {
    resourceInventory[type] = Math.max(0, amount);
    resourceVersion.value++;
}

export function replaceInventory(values: Partial<Record<ResourceType, number>>) {
    for (const key in values) {
        const k = key as ResourceType;
        const v = values[k];
        if (typeof v === 'number') {
            resourceInventory[k] = v;
        }
    }
    resourceVersion.value++;
}

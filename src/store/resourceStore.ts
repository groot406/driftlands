import { reactive, ref } from 'vue';
import type { ResourceType } from '../core/world';

// Reactive inventory of delivered (warehouse-deposited) resources.
export const resourceInventory: Record<ResourceType, number> = reactive({
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
  resourceInventory[type] += amount;
  resourceVersion.value++;
}

export function resetResourceInventory() {
  for (const k of Object.keys(resourceInventory) as ResourceType[]) {
    resourceInventory[k] = 0;
  }
  resourceVersion.value++;
}

// Convenience: derive in-transit resources (heroes carrying) if needed later.
// (Not implemented yet; placeholder for future UI enhancements.)


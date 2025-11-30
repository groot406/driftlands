import { reactive, ref, watch } from 'vue';
import type { ResourceType } from '../core/world';

// Persistence config
const GLOBAL_RES_KEY = 'driftlands_resources_v1'; // legacy global
const RES_VERSION = 1;
const SAVE_DEBOUNCE_MS = 500;
let currentWorldId: string = 'default';
function resKey(worldId: string) { return `driftlands_resources_${worldId}_v1`; }

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

// --- Internal persistence state ---
let saveTimer: number | null = null;
let lastSerialized: string | null = null; // avoid redundant writes
let restoring = false;

function serializeInventory(): string {
  const payload = {
    version: RES_VERSION,
    ts: Date.now(),
    worldId: currentWorldId,
    inventory: { ...resourceInventory },
  };
  return JSON.stringify(payload);
}

function persistResourcesImmediate() {
  if (typeof window === 'undefined') return;
  try {
    const json = serializeInventory();
    if (json === lastSerialized) return; // skip unchanged
    localStorage.setItem(resKey(currentWorldId), json);
    lastSerialized = json;
  } catch {
    // ignore storage errors
  }
}

function schedulePersist() {
  if (restoring) return; // don't immediately re-save after restore
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    persistResourcesImmediate();
  }, SAVE_DEBOUNCE_MS);
}

function sanitizeNumber(v: any): number {
  if (typeof v !== 'number' || !isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

function migrateLegacyIfNeeded(worldId: string) {
  try {
    const legacyRaw = localStorage.getItem(GLOBAL_RES_KEY);
    if (!legacyRaw) return;
    const targetKey = resKey(worldId);
    if (localStorage.getItem(targetKey)) return; // already has world-specific save
    localStorage.setItem(targetKey, legacyRaw);
    // optional: keep legacy for fallback
  } catch {}
}

function restoreResources() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(resKey(currentWorldId));
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    if (data.version !== RES_VERSION || !data.inventory || typeof data.inventory !== 'object') return;
    restoring = true;
    resourceInventory.wood = sanitizeNumber(data.inventory.wood);
    resourceInventory.ore = sanitizeNumber(data.inventory.ore);
    resourceInventory.stone = sanitizeNumber(data.inventory.stone);
    resourceInventory.food = sanitizeNumber(data.inventory.food);
    resourceInventory.crystal = sanitizeNumber(data.inventory.crystal);
    resourceInventory.artifact = sanitizeNumber(data.inventory.artifact);
    resourceVersion.value++; // reflect restore
    lastSerialized = serializeInventory(); // baseline
  } catch {
    // ignore parse errors
  } finally {
    restoring = false;
  }
}

export function setCurrentWorldIdForResources(worldId: string) {
  currentWorldId = worldId || 'default';
  migrateLegacyIfNeeded(currentWorldId);
  restoreResources();
}

export function depositResource(type: ResourceType, amount: number = 1) {
  if (amount <= 0) return;
  if(!resourceInventory[type]) resourceInventory[type] = 0;
  resourceInventory[type] += amount;
  resourceVersion.value++;
}

export function resetResourceInventory() {
  for (const k of Object.keys(resourceInventory) as ResourceType[]) {
    resourceInventory[k] = 0;
  }
  resourceVersion.value++;
}

export function clearResourcePersistence() {
  try { localStorage.removeItem(resKey(currentWorldId)); } catch { /* ignore */ }
  resetResourceInventory();
  lastSerialized = null;
}

// Watch mutations and persist (debounced)
if (typeof window !== 'undefined') {
  watch(resourceVersion, () => schedulePersist(), { flush: 'post' });
  // Do not restore until worldId is provided by UI; default world can be used if needed elsewhere.
  // Ensure last state saved on unload (final flush)
  window.addEventListener('beforeunload', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persistResourcesImmediate();
  });
}
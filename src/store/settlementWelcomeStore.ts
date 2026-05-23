import { computed, ref } from 'vue';
import { seasonSnapshot } from './seasonStore.ts';

const STORAGE_KEY = 'driftlands-settlement-welcome-dismissed-v1';

interface SettlementWelcomeState {
  settlementId: string;
  openedAt: number;
}

export const activeSettlementWelcome = ref<SettlementWelcomeState | null>(null);
export const isSettlementWelcomeOpen = computed(() => !!activeSettlementWelcome.value);

function readDismissedKeys() {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const keys = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function writeDismissedKeys(keys: Set<string>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Local storage is optional; the welcome panel still works for this session.
  }
}

function getWelcomeKey(settlementId: string) {
  const seasonId = seasonSnapshot.value?.seasonId ?? 'unseasoned';
  return `${seasonId}:${settlementId}`;
}

export function queueSettlementWelcome(settlementId: string | null | undefined) {
  if (!settlementId) {
    return;
  }

  const dismissed = readDismissedKeys();
  if (dismissed.has(getWelcomeKey(settlementId))) {
    return;
  }

  activeSettlementWelcome.value = {
    settlementId,
    openedAt: Date.now(),
  };
}

export function dismissSettlementWelcome() {
  const active = activeSettlementWelcome.value;
  if (!active) {
    return;
  }

  const dismissed = readDismissedKeys();
  dismissed.add(getWelcomeKey(active.settlementId));
  writeDismissedKeys(dismissed);
  activeSettlementWelcome.value = null;
}

import {reactive} from 'vue';
import {loadWorld, startWorldGeneration, tiles as worldTiles} from '../core/world';
import {idleStore, startIdle} from './idleStore';
import {ensureHeroSelected, resetHeroes, selectedHeroId, setCurrentWorldId} from './heroStore';
import { setCurrentWorldIdForResources, clearResourcePersistence } from './resourceStore';
import {camera, moveCamera} from '../core/camera';
import {clearAllTasks} from './taskStore';
import { openWindow, closeWindow, WINDOW_IDS } from '../core/windowManager';

export type Phase = 'title' | 'playing';

interface UIState {
    phase: Phase;
    canContinue: boolean; // derived from localStorage save presence
    menuOpen: boolean; // in-game menu visibility
}

const SAVE_KEY = 'driftlands-save';
const STATE_KEY = 'driftlands-ui-state-v1';
const WORLD_META_KEY = 'driftlands-world-meta-v1';
const NEW_GAME_RADIUS = 1;

function hasSave(): boolean {
    try {
        return !!localStorage.getItem(SAVE_KEY);
    } catch {
        return false;
    }
}

export const uiStore = reactive<UIState>({
    phase: 'title',
    canContinue: hasSave(),
    menuOpen: false,
});

function persistUIState() {
    try {
        const payload = {
            camera: {q: camera.q, r: camera.r, targetQ: camera.targetQ, targetR: camera.targetR},
            selectedHeroId: selectedHeroId.value,
            ts: Date.now(),
        };
        localStorage.setItem(STATE_KEY, JSON.stringify(payload));
    } catch {
    }
}

function restoreUIState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && data.camera) {
            moveCamera(data.camera.targetQ ?? data.camera.q ?? 0, data.camera.targetR ?? data.camera.r ?? 0);
        }
        if (data && data.selectedHeroId) {
            selectedHeroId.value = data.selectedHeroId;
        }
        ensureHeroSelected(); // default focus true
    } catch {
    }
}

function loadWorldMeta(): { worldId: string } | null {
  try {
    const raw = localStorage.getItem(WORLD_META_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data.worldId === 'string') return { worldId: data.worldId };
  } catch {}
  return null;
}
function saveWorldMeta(worldId: string) {
  try { localStorage.setItem(WORLD_META_KEY, JSON.stringify({ worldId, ts: Date.now() })); } catch {}
}

export function startNewGame() {
    // Assign new world id
    const worldId = 'world_' + Date.now().toString(36);
    saveWorldMeta(worldId);
    setCurrentWorldId(worldId);
    setCurrentWorldIdForResources(worldId);
    // Clear resource stats for this new world
    clearResourcePersistence();
    // Clear & generate a fresh world
    startWorldGeneration(NEW_GAME_RADIUS);
    // Reset tasks & heroes
    clearAllTasks();
    resetHeroes();
    // Stub save marker so Continue is enabled next launch.
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ts: Date.now(), radius: NEW_GAME_RADIUS, worldId}));
    } catch {
    }
    uiStore.canContinue = true;
    uiStore.phase = 'playing';
    startIdle();
    persistUIState();
}

export function continueGame() {
    if (!uiStore.canContinue) return;
    const meta = loadWorldMeta();
    const rawSave = localStorage.getItem(SAVE_KEY);
    let worldId: string | null = meta?.worldId || null;
    if (!worldId && rawSave) {
        try { const data = JSON.parse(rawSave); if (data && typeof data.worldId === 'string') worldId = data.worldId; } catch {}
    }
    if (!worldId) worldId = 'world_default';
    setCurrentWorldId(worldId);
    setCurrentWorldIdForResources(worldId);
    // Load saved idleStore tiles if world not yet initialized.
    if (worldTiles.length === 0 && idleStore.tiles.length) {
        loadWorld(idleStore.tiles);
    }
    uiStore.phase = 'playing';
    startIdle();
    restoreUIState();
    ensureHeroSelected(true);
}

export function resumeGame() { // repurposed: close menu
    uiStore.menuOpen = false;
    closeWindow(WINDOW_IDS.IN_GAME_MENU);
    if (!idleStore.running) startIdle();
    restoreUIState();
    ensureHeroSelected(false);
}

export function pauseGame() {
    if (uiStore.phase !== 'playing') return;

    uiStore.menuOpen = true;
    openWindow(WINDOW_IDS.IN_GAME_MENU);
    persistUIState();
}

export function returnToTitle() {
    uiStore.phase = 'title';
    uiStore.menuOpen = false;
    closeWindow(WINDOW_IDS.IN_GAME_MENU);
}

export function isTitle() {
    return uiStore.phase === 'title';
}

export function isPaused() {
    return uiStore.menuOpen;
}

export function isPlaying() {
    return uiStore.phase === 'playing' && !uiStore.menuOpen;
}

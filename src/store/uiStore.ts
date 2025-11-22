import {reactive} from 'vue';
import {loadWorld, startWorldGeneration, tiles as worldTiles} from '../core/world';
import {idleStore, startIdle} from './idleStore';
import {ensureHeroSelected, resetHeroes, selectedHeroId} from './heroStore';
import {camera, moveCamera} from '../core/camera';
import {clearAllTasks} from './taskStore';

export type Phase = 'title' | 'playing';

interface UIState {
    phase: Phase;
    canContinue: boolean; // derived from localStorage save presence
    menuOpen: boolean; // in-game menu visibility
}

const SAVE_KEY = 'driftlands-save';
const STATE_KEY = 'driftlands-ui-state-v1';
const NEW_GAME_RADIUS = 0;

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

export function startNewGame() {
    // Clear & generate a fresh world
    startWorldGeneration(NEW_GAME_RADIUS);
    // Reset tasks & heroes
    clearAllTasks();
    resetHeroes();
    // Stub save marker so Continue is enabled next launch.
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ts: Date.now(), radius: NEW_GAME_RADIUS}));
    } catch {
    }
    uiStore.canContinue = true;
    uiStore.phase = 'playing';
    startIdle();
    persistUIState();
}

export function continueGame() {
    if (!uiStore.canContinue) return;
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
    if (!idleStore.running) startIdle();
    restoreUIState();
    ensureHeroSelected(false);
}

export function pauseGame() {
    if (uiStore.phase !== 'playing') return;

    uiStore.menuOpen = true;
    persistUIState();
}

export function returnToTitle() {
    uiStore.phase = 'title';
    uiStore.menuOpen = false;
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
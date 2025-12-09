import {reactive} from 'vue';
import {startIdle} from './idleStore';
import {ensureHeroSelected,  selectedHeroId } from './heroStore';
import {camera, moveCamera} from '../core/camera';
import { openWindow, closeWindow, WINDOW_IDS } from '../core/windowManager';

export type Phase = 'title' | 'playing';

interface UIState {
    phase: Phase;
    menuOpen: boolean; // in-game menu visibility
}

const STATE_KEY = 'driftlands-ui-state-v1';

export const uiStore = reactive<UIState>({
    phase: 'title',
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

export function resumeGame() {
    uiStore.phase = 'playing';
    uiStore.menuOpen = false;
    closeWindow(WINDOW_IDS.IN_GAME_MENU);
    startIdle();
    restoreUIState();
    ensureHeroSelected(true);
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

import { reactive } from 'vue';
import { startWorldGeneration, tiles as worldTiles, loadWorld } from '../core/world';
import { idleStore } from './idleStore';
import { startIdle } from './idleStore';
import { resetHeroes } from './heroStore';
import { camera, moveCamera } from '../core/camera';
import { selectedHeroId, ensureHeroSelected } from './heroStore';

export type Phase = 'title' | 'playing' | 'paused';

interface UIState {
  phase: Phase;
  canContinue: boolean; // derived from localStorage save presence
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
});

function persistUIState() {
  try {
    const payload = {
      camera: { q: camera.q, r: camera.r, targetQ: camera.targetQ, targetR: camera.targetR },
      selectedHeroId: selectedHeroId.value,
      ts: Date.now(),
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(payload));
  } catch {}
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
    ensureHeroSelected();
  } catch {}
}

export function startNewGame() {
  // Clear & generate a fresh world
  startWorldGeneration(NEW_GAME_RADIUS);
  // Reset hero roster/state for new game
  resetHeroes();
  // Stub save marker so Continue is enabled next launch.
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ts: Date.now(), radius: NEW_GAME_RADIUS }));
  } catch {}
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

export function resumeGame() {
  if (uiStore.phase === 'paused') uiStore.phase = 'playing';
  if (!idleStore.running) startIdle();
  restoreUIState();
  ensureHeroSelected(false);
}

export function pauseGame() {
  if (uiStore.phase === 'playing') uiStore.phase = 'paused';
  persistUIState();
  // idle loop keeps scheduling but skips ticks; leave running flag true to resume seamlessly
}

export function returnToTitle() {
  uiStore.phase = 'title';
}

export function isTitle() { return uiStore.phase === 'title'; }
export function isPaused() { return uiStore.phase === 'paused'; }
export function isPlaying() { return uiStore.phase === 'playing'; }

// if (typeof window !== 'undefined') {
//   // Attempt initial restore when module loads (for continue)
//   restoreUIState();
//   ensureHeroSelected(false);
// }

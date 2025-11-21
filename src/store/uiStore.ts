import { reactive } from 'vue';
import { startWorldGeneration, tiles as worldTiles, loadWorld } from '../core/world';
import { idleStore } from './idleStore';

export type Phase = 'title' | 'playing' | 'paused';

interface UIState {
  phase: Phase;
  canContinue: boolean; // derived from localStorage save presence
}

const SAVE_KEY = 'driftlands-save';
const NEW_GAME_RADIUS = 6; // generation radius for a fresh world

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

export function startNewGame() {
  // Clear & generate a fresh world
  startWorldGeneration(NEW_GAME_RADIUS);
  // Stub save marker so Continue is enabled next launch.
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ts: Date.now(), radius: NEW_GAME_RADIUS }));
  } catch {}
  uiStore.canContinue = true;
  uiStore.phase = 'playing';
}

export function continueGame() {
  if (!uiStore.canContinue) return;
  // Load saved idleStore tiles if world not yet initialized.
  if (worldTiles.length === 0 && idleStore.tiles.length) {
    loadWorld(idleStore.tiles);
  }
  uiStore.phase = 'playing';
}

export function resumeGame() {
  if (uiStore.phase === 'paused') uiStore.phase = 'playing';
}

export function pauseGame() {
  if (uiStore.phase === 'playing') uiStore.phase = 'paused';
}

export function returnToTitle() {
  uiStore.phase = 'title';
}

export function isTitle() { return uiStore.phase === 'title'; }
export function isPaused() { return uiStore.phase === 'paused'; }
export function isPlaying() { return uiStore.phase === 'playing'; }

import {reactive, ref, watch} from 'vue';
import {heroes } from './heroStore';
import { getSettler } from './settlerStore';
import {camera} from '../core/camera';
import {soundService} from '../core/soundService';
import { openWindow, closeWindow, WINDOW_IDS } from '../core/windowManager';
import type {Hero} from "../core/types/Hero.ts";
import type { Settler } from '../core/types/Settler';
import { resetNotifications } from './notificationStore';
import type { ResourceType } from '../core/types/Resource.ts';
import { currentPlayerSettlementId } from './settlementStartStore.ts';
import { currentPlayerId } from '../core/socket.ts';
import { canControlHero } from './playerStore.ts';
export type Phase = 'title' | 'playing';

interface UIState {
    phase: Phase;
    menuOpen: boolean; // in-game menu visibility
}

const STATE_KEY = 'driftlands-ui-state-v1';
export const selectedHeroId = ref<string | null>(null);
export const selectedSettlerId = ref<string | null>(null);
export const selectedResourceDetail = ref<ResourceType | null>(null);

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
        if (data && data.selectedHeroId) {
            selectedHeroId.value = data.selectedHeroId;
        }
        ensureHeroSelected(false);
    } catch {
    }
}

function isSelectableHero(hero: Hero) {
    if (!canControlHero(hero.id, currentPlayerId.value)) {
        return false;
    }

    const settlementId = currentPlayerSettlementId.value;

    if (settlementId) {
        return hero.settlementId === settlementId;
    }

    return !hero.playerId && !hero.settlementId;
}

function findPreferredHero() {
    const settlementId = currentPlayerSettlementId.value;

    return heroes.find((hero) => settlementId && hero.settlementId === settlementId)
        ?? heroes.find((hero) => !hero.playerId && !hero.settlementId)
        ?? null;
}

export function ensureHeroSelected(focus: boolean = false) {
    const current = selectedHeroId.value ? heroes.find(h => h.id === selectedHeroId.value) : null;
    const hero = current && isSelectableHero(current) ? current : findPreferredHero();
    if (hero) {
        selectedHeroId.value = hero.id;
        return;
    }

    selectedHeroId.value = null;
}

export function selectHero(hero: Hero | null, focus: boolean = false) {
    if (hero) {
        if (!isSelectableHero(hero)) {
            ensureHeroSelected(false);
            return;
        }

        selectedHeroId.value = hero.id;
    } else {
        selectedHeroId.value = null;
    }
}

export function getSelectedHero(): Hero | null {
    return selectedHeroId.value ? (heroes.find(h => h.id === selectedHeroId.value) || null) : null;
}

export function openSettlerModal(settler: Settler | null) {
    selectedSettlerId.value = settler?.id ?? null;
    if (settler) {
        openWindow(WINDOW_IDS.SETTLER_MODAL);
        return;
    }

    closeWindow(WINDOW_IDS.SETTLER_MODAL);
}

export function closeSettlerModal() {
    selectedSettlerId.value = null;
    closeWindow(WINDOW_IDS.SETTLER_MODAL);
}

export function getSelectedSettler(): Settler | null {
    return selectedSettlerId.value ? getSettler(selectedSettlerId.value) : null;
}

export function openPopulationModal() {
    openWindow(WINDOW_IDS.POPULATION_MODAL);
}

export function closePopulationModal() {
    closeWindow(WINDOW_IDS.POPULATION_MODAL);
}

export function openResourceDetailModal(resourceType: ResourceType) {
    selectedResourceDetail.value = resourceType;
    openWindow(WINDOW_IDS.RESOURCE_MODAL);
}

export function closeResourceDetailModal() {
    selectedResourceDetail.value = null;
    closeWindow(WINDOW_IDS.RESOURCE_MODAL);
}


export function resumeGame() {
    uiStore.phase = 'playing';
    uiStore.menuOpen = false;
    closeWindow(WINDOW_IDS.IN_GAME_MENU);
    restoreUIState();
    ensureHeroSelected(false);

    soundService.resumeAll();
}

export function pauseGame() {
    if (uiStore.phase !== 'playing') return;

    uiStore.menuOpen = true;
    openWindow(WINDOW_IDS.IN_GAME_MENU);
    persistUIState();

    soundService.pauseSounds();
}

export function returnToTitle() {
    uiStore.phase = 'title';
    uiStore.menuOpen = false;
    soundService.pauseSounds();
    closeWindow(WINDOW_IDS.IN_GAME_MENU);
    closeWindow(WINDOW_IDS.MISSION_CENTER);
    closeWindow(WINDOW_IDS.NOTIFICATION_CENTER);
    closePopulationModal();
    closeResourceDetailModal();
    closeSettlerModal();
    resetNotifications();
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

watch(currentPlayerSettlementId, () => {
    ensureHeroSelected(false);
});

import {watch} from 'vue';
import {tiles, type Tile, worldVersion} from '../core/world';
import {generationInProgress, generationStatus, generationCompleted, generationTotal, generationProgress} from '../core/world';

interface IdleState {
    radius: number;
    tiles: Tile[];
    tick: number;
    running: boolean;
    worldVersion: number;
    // Added generation progress tracking fields for UI loading component
    generationInProgress: boolean;
    generationStatus: string;
    generationProgress: number;
    generationCompleted: number;
    generationTotal: number;
}

const LOCAL_KEY = 'driftlands_idle_state_v1';

function loadState(): IdleState | null {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Patch older save versions missing new fields
        if (parsed) {
            parsed.generationInProgress = parsed.generationInProgress ?? false;
            parsed.generationStatus = parsed.generationStatus ?? '';
            parsed.generationProgress = parsed.generationProgress ?? 0;
            parsed.generationCompleted = parsed.generationCompleted ?? 0;
            parsed.generationTotal = parsed.generationTotal ?? 0;
        }
        return parsed;
    } catch {
        return null;
    }
}

function saveState(_state: IdleState) {
    try {
        console.log('save');
        localStorage.setItem(LOCAL_KEY, JSON.stringify(_state));
    } catch (e) {
        console.log('save error', e);
        // ignore quota/security errors
    }
}

// Keep idle store initialization with imported tiles/worldVersion
const initial: IdleState = (loadState() as IdleState) ?? {
    radius: 4,
    tiles: tiles,
    tick: 0,
    running: false,
    worldVersion: worldVersion.value,
    generationInProgress: false,
    generationStatus: '',
    generationProgress: 0,
    generationCompleted: 0,
    generationTotal: 0
};
export const idleStore = initial;

watch(worldVersion, () => {
    saveState(idleStore);
}, {deep: true});

// Sync world generation reactive refs into idleStore so UI components can read them directly
watch([generationInProgress, generationStatus, generationProgress, generationCompleted, generationTotal], () => {
    idleStore.generationInProgress = generationInProgress.value;
    idleStore.generationStatus = generationStatus.value;
    idleStore.generationProgress = generationProgress.value;
    idleStore.generationCompleted = generationCompleted.value;
    idleStore.generationTotal = generationTotal.value;
}, {deep: false});

export function startIdle() {
    if (idleStore.running) return;
    idleStore.running = true;
    loop();
}

function loop() {
    if (!idleStore.running) return;
    idleStore.tick++;

    //const dt = 1 / 60; // simulation step seconds
    // idleStore.tiles.forEach(tile => {
    //     const task = tile.task;
    //     if (!task || task.completed) return;
    //     const heroes = idleStore.heroes.filter(h => task.assignedHeroIds.includes(h.id));
    //     const collectiveRate = heroes.reduce((acc, h) => acc + speedMultiplier(h) * statMultiplier(h, task.def), 0) * synergyMultiplier(heroes.length);
    //     task.progress += collectiveRate * dt * 0.5; // 0.5 tuning factor
    //     if (task.progress >= task.required) {
    //         task.progress = task.required;
    //     }
    // });
    requestAnimationFrame(loop);
}

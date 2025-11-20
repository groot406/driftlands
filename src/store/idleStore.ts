import {watch} from 'vue';
import {tiles, type Tile, worldVersion} from '../core/world';

interface IdleState {
    radius: number;
    tiles: Tile[];
    tick: number;
    running: boolean;
    worldVersion: number;
}

const LOCAL_KEY = 'driftlands_idle_state_v1';

function loadState(): IdleState | null {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
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
    worldVersion: worldVersion.value
};
export const idleStore = initial;

watch(worldVersion, () => {
    saveState(idleStore);
}, {deep: true});

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

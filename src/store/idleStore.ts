import {watch} from 'vue';
import {type Tile, tiles, worldVersion} from '../core/world';
import { isPaused } from './uiStore';
import { updateActiveTasks } from './taskStore';
import { heroes } from './heroStore';

interface IdleState {
    tiles: Tile[];
    tick: number;
    running: boolean;
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
    }
}

const initial: IdleState = (loadState() as IdleState) ?? {
    tiles,
    tick: 0,
    running: false,
};
export const idleStore = initial;

watch(worldVersion, () => {
    idleStore.tiles = tiles;
    saveState(idleStore);
});

export function startIdle() {
    idleStore.running = true;
    loop();
}

async function loop() {
    if (!idleStore.running) return;
    if (isPaused()) { // while paused, defer tick increment & reschedule
        requestAnimationFrame(loop);
        return;
    }
    idleStore.tick++;

    updateActiveTasks(heroes);
    requestAnimationFrame(loop);
}

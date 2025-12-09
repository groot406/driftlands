import {type Tile, tiles } from '../core/world';
import { updateActiveTasks } from './taskStore';
import { heroes } from './heroStore';
import { updateTileGrowth, fastForwardGrowthOffline } from '../core/growth';

interface IdleState {
    tiles: Tile[];
    tick: number;
    running: boolean;
    lastUpdateMs?: number;
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

const initial: IdleState = (loadState() as IdleState) ?? {
    tiles,
    tick: 0,
    running: false,
    lastUpdateMs: Date.now(),
};
export const idleStore = initial;

export function startIdle() {
    // Apply offline progression based on elapsed time
    const nowMs = Date.now();
    const lastMs = idleStore.lastUpdateMs ?? nowMs;
    fastForwardGrowthOffline(lastMs, nowMs);
    idleStore.lastUpdateMs = nowMs;

    idleStore.running = true;
    loop();
}

async function loop() {
    if (!idleStore.running) return;
    idleStore.tick++;
    updateActiveTasks(heroes);
    updateTileGrowth();
    // update lastUpdateMs each frame and persist occasionally
    idleStore.lastUpdateMs = Date.now();
    requestAnimationFrame(loop);
}

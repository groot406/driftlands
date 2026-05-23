import { createLoader, finishLoader, getLoader, updateLoader, type Loader } from './loader';

export const WORLD_SYNC_LOADER_ID = 'world-sync';

type WorldSyncLoaderPatch = Partial<Omit<Loader, 'id'>>;

function nextPaint(callback: () => void): void {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        globalThis.setTimeout(callback, 0);
        return;
    }

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(callback);
    });
}

export function startWorldSyncLoader(status = 'Connecting to frontier...'): void {
    createLoader(WORLD_SYNC_LOADER_ID, {
        title: 'Loading colony...',
        status,
        infinite: true,
        popup: true,
    });
    updateLoader(WORLD_SYNC_LOADER_ID, {
        title: 'Loading colony...',
        status,
        completed: 0,
        total: 0,
        unitLabel: undefined,
        infinite: true,
        active: true,
        popup: true,
    });
}

export function updateWorldSyncLoader(patch: WorldSyncLoaderPatch): void {
    if (!getLoader(WORLD_SYNC_LOADER_ID)) {
        startWorldSyncLoader(patch.status ?? 'Loading colony...');
    }

    updateLoader(WORLD_SYNC_LOADER_ID, patch);
}

export function finishWorldSyncLoaderAfterPaint(finalStatus = 'Ready'): void {
    if (!getLoader(WORLD_SYNC_LOADER_ID)) {
        return;
    }

    updateLoader(WORLD_SYNC_LOADER_ID, {
        status: finalStatus,
        completed: 1,
        total: 1,
        infinite: false,
    });

    nextPaint(() => finishLoader(WORLD_SYNC_LOADER_ID, finalStatus));
}

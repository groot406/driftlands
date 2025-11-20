import {computed, reactive} from 'vue';

export interface Loader {
    id: string;
    title: string;
    status: string;
    progress: number; // 0-1
    completed: number;
    total: number;
    unitLabel?: string; // e.g. Tiles, Items, Assets
    active: boolean;
}

// Reactive registry of loaders
const _loaders = reactive<Record<string, Loader>>({});

export function createLoader(id: string, opts: Partial<Omit<Loader, 'id' | 'active' | 'progress'>> & {
    title: string
}): Loader {
    let existing = _loaders[id];
    if (existing) return existing;
    const loader: Loader = {
        id,
        title: opts.title,
        status: opts.status ?? '',
        completed: opts.completed ?? 0,
        total: opts.total ?? 0,
        progress: 0,
        unitLabel: opts.unitLabel ?? 'Items',
        active: true,
    };
    computeProgress(loader);
    _loaders[id] = loader;
    return loader;
}

function computeProgress(l: Loader) {
    if (l.total <= 0) {
        l.progress = l.completed > 0 ? 1 : 0;
    } else {
        l.progress = Math.min(1, l.completed / l.total);
    }
}

export function updateLoader(id: string, patch: Partial<Omit<Loader, 'id'>>) {
    const loader = _loaders[id];
    if (!loader) return;
    Object.assign(loader, patch);
    computeProgress(loader);
}

export function finishLoader(id: string, finalStatus: string = 'Complete') {
    const loader = _loaders[id];
    if (!loader) return;
    loader.completed = loader.total;
    computeProgress(loader);
    loader.status = finalStatus;
    loader.active = false;
}

export function getLoader(id: string): Loader | undefined {
    return _loaders[id];
}

export const getActiveLoaders = () => computed(() => Object.values(_loaders).filter(l => l.active));

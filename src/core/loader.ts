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
    popup?: boolean; // Indicates loader should show as popup/modal
    infinite?: boolean; // Indicates loader is infinite (no defined total/progress)
}

export type LoaderOptions = Partial<Omit<Loader, 'id' | 'active' | 'progress'>> & { title: string };

// Reactive registry of loaders
const _loaders = reactive<Record<string, Loader>>({});

export function createLoader(id: string, opts: LoaderOptions): Loader {
    let existing = _loaders[id];
    if (existing) return existing;
    const loader: Loader = {
        id,
        title: opts.title,
        status: opts.status ?? '',
        completed: opts.completed ?? 0,
        total: opts.total ?? 0,
        progress: 0,
        unitLabel: opts.unitLabel,
        active: true,
        infinite: opts.infinite ?? false,
        popup: opts.popup ?? true,
    };
    computeProgress(loader);
    _loaders[id] = loader;
    return loader;
}

function computeProgress(l: Loader) {
    if (l.infinite) {
        l.progress = 0;
    } else if (l.total <= 0) {
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
    delete _loaders[id];
}

export function getLoader(id: string): Loader | undefined {
    return _loaders[id];
}

export const getActiveLoaders = () => computed(() => Object.values(_loaders).filter(l => l.active));

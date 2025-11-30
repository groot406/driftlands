import {reactive} from 'vue';

export interface TextIndicator {
    position: {
        q: number
        r: number;
        currentOffset ?: {x: number, y: number };
    };
    text: string;
    color: string;
    created: number;
    duration: number;
}

// Reactive registry of loaders
const _indicators = reactive<TextIndicator[]>([]);

export function addTextIndicator(position: {q: number, r: number}, text: string, color: string, duration: number): void {
    const indicator: TextIndicator = {
        position,
        text,
        color,
        created: performance.now(),
        duration,
    };
    _indicators.push(indicator);
}

export function getTextIndicators(): TextIndicator[] {
    const now = performance.now();
    // Remove expired indicators
    for (let i = _indicators.length - 1; i >= 0; i--) {
        const indicator = _indicators[i];
        if (!indicator) {
            continue;
        }

        if (now - indicator.created >= indicator.duration) {
            _indicators.splice(i, 1);
        }
    }
    return _indicators;
}

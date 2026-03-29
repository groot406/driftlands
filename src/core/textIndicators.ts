import {reactive} from 'vue';

export interface TextIndicator {
    position: {
        q: number
        r: number;
        currentOffset ?: {x: number, y: number };
    };
    heroId?: string;
    worldAnchor?: {
        x: number;
        y: number;
    };
    text: string;
    color: string;
    created: number;
    duration: number;
}

// Reactive registry of loaders
const _indicators = reactive<TextIndicator[]>([]);

export function addTextIndicator(
    position: {q: number, r: number, currentOffset?: {x: number, y: number }, id?: string},
    text: string,
    color: string,
    duration: number
): void {
    const indicator: TextIndicator = {
        position: {
            q: position.q,
            r: position.r,
            currentOffset: position.currentOffset ? { ...position.currentOffset } : undefined,
        },
        heroId: position.id,
        text,
        color,
        created: Date.now(),
        duration,
    };
    _indicators.push(indicator);
}

export function getTextIndicators(): TextIndicator[] {
    const now = Date.now();
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

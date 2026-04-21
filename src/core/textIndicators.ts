import {reactive} from 'vue';
import { axialToPixel } from './camera';
import { DEFAULT_RENDER_CONFIG } from './render/RenderConfig';
import type { Hero } from './types/Hero';

type TextIndicatorSource = Pick<Hero, 'q' | 'r'>
    & Partial<Pick<Hero, 'currentOffset'>>
    & Partial<Pick<Hero, 'id' | 'facing' | 'movement'>>;

export interface TextIndicator {
    position: {
        q: number
        r: number;
        currentOffset ?: {x: number, y: number };
    };
    worldAnchor?: {
        x: number;
        y: number;
    };
    text: string;
    color: string;
    created: number;
    duration: number;
    stackIndex?: number;
}

// Reactive registry of loaders
const _indicators = reactive<TextIndicator[]>([]);
const TEXT_INDICATOR_STACK_ANCHOR_PRECISION = 0.5;

function resolveSourceWorldPosition(position: TextIndicatorSource, nowMs: number) {
    if (!position.movement) {
        return axialToPixel(position.q, position.r);
    }

    const movement = position.movement;
    const elapsed = nowMs - movement.startMs;
    if (elapsed < 0) {
        return axialToPixel(movement.origin.q, movement.origin.r);
    }

    const total = movement.cumulative[movement.cumulative.length - 1]!;
    if (elapsed >= total) {
        return axialToPixel(movement.target.q, movement.target.r);
    }

    let stepIndex = 0;
    while (stepIndex < movement.cumulative.length && elapsed >= movement.cumulative[stepIndex]!) {
        stepIndex++;
    }

    if (stepIndex >= movement.path.length) {
        return axialToPixel(position.q, position.r);
    }

    const prevEnd = stepIndex === 0 ? 0 : movement.cumulative[stepIndex - 1]!;
    const stepElapsed = elapsed - prevEnd;
    const stepDuration = movement.stepDurations[stepIndex]!;
    const progress = Math.min(1, Math.max(0, stepElapsed / stepDuration));
    const from = stepIndex === 0 ? movement.origin : movement.path[stepIndex - 1];
    const to = movement.path[stepIndex];

    if (!from || !to) {
        return axialToPixel(position.q, position.r);
    }

    const fromPx = axialToPixel(from.q, from.r);
    const toPx = axialToPixel(to.q, to.r);

    return {
        x: fromPx.x + ((toPx.x - fromPx.x) * progress),
        y: fromPx.y + ((toPx.y - fromPx.y) * progress),
    };
}

function resolveWorldAnchor(position: TextIndicatorSource, nowMs: number) {
    const base = resolveSourceWorldPosition(position, nowMs);
    const offset = position.currentOffset ?? {x: 0, y: 0};

    return {
        x: base.x + offset.x - (DEFAULT_RENDER_CONFIG.heroFrameSize / 2),
        y: base.y + offset.y - (DEFAULT_RENDER_CONFIG.heroFrameSize * 1.5) - 8,
    };
}

function getStackAnchorKey(indicator: TextIndicator) {
    const anchor = indicator.worldAnchor;
    if (anchor) {
        const x = Math.round(anchor.x / TEXT_INDICATOR_STACK_ANCHOR_PRECISION);
        const y = Math.round(anchor.y / TEXT_INDICATOR_STACK_ANCHOR_PRECISION);
        return `${x},${y}`;
    }

    const offset = indicator.position.currentOffset ?? {x: 0, y: 0};
    return `${indicator.position.q},${indicator.position.r},${offset.x},${offset.y}`;
}

function updateStackIndices() {
    const groups = new Map<string, TextIndicator[]>();

    for (const indicator of _indicators) {
        const key = getStackAnchorKey(indicator);
        let group = groups.get(key);
        if (!group) {
            group = [];
            groups.set(key, group);
        }
        group.push(indicator);
    }

    for (const group of groups.values()) {
        group.forEach((indicator, index) => {
            indicator.stackIndex = index;
        });
    }
}

export function addTextIndicator(
    position: TextIndicatorSource,
    text: string,
    color: string,
    duration: number
): void {
    const created = Date.now();
    const indicator: TextIndicator = {
        position: {
            q: position.q,
            r: position.r,
            currentOffset: position.currentOffset ? { ...position.currentOffset } : undefined,
        },
        worldAnchor: resolveWorldAnchor(position, created),
        text,
        color,
        created,
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

    updateStackIndices();
    return _indicators;
}

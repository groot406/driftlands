import type { ViewportSnapshot } from '../RenderTypes';

export interface ViewportBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export function getCanvasCenter(viewport: ViewportSnapshot) {
    return {
        x: viewport.width / 2,
        y: viewport.height / 2,
    };
}

export function getViewportBounds(viewport: ViewportSnapshot, margin: number = 0): ViewportBounds {
    return {
        minX: -margin,
        minY: -margin,
        maxX: viewport.width + margin,
        maxY: viewport.height + margin,
    };
}

export function isScreenPointInBounds(screenX: number, screenY: number, bounds: ViewportBounds) {
    return screenX >= bounds.minX
        && screenX <= bounds.maxX
        && screenY >= bounds.minY
        && screenY <= bounds.maxY;
}

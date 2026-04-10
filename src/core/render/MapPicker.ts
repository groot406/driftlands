import { HexProjection } from './math/HexProjection';
import type { ViewportSnapshot } from './RenderTypes';

export interface CanvasClientRect {
    left: number;
    top: number;
}

export interface PickableBounds {
    entityId: string;
    left: number;
    top: number;
    width: number;
    height: number;
}

export class MapPicker {
    static pickAxialFromClientPoint(
        clientX: number,
        clientY: number,
        rect: CanvasClientRect,
        viewport: ViewportSnapshot,
    ) {
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;
        return HexProjection.screenToAxial(screenX, screenY, viewport);
    }

    static pickBoundsFromClientPoint<T extends PickableBounds>(
        clientX: number,
        clientY: number,
        rect: CanvasClientRect,
        bounds: readonly T[],
        isHit?: (bound: T, localX: number, localY: number) => boolean,
    ) {
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;

        for (let index = bounds.length - 1; index >= 0; index--) {
            const bound = bounds[index];
            if (!bound) {
                continue;
            }
            if (
                screenX < bound.left
                || screenX > (bound.left + bound.width)
                || screenY < bound.top
                || screenY > (bound.top + bound.height)
            ) {
                continue;
            }

            const localX = Math.floor(screenX - bound.left);
            const localY = Math.floor(screenY - bound.top);
            if (!isHit || isHit(bound, localX, localY)) {
                return bound;
            }
        }

        return null;
    }
}

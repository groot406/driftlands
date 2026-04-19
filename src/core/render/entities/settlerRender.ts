import { axialToPixel } from '../../camera';
import type { Settler } from '../../types/Settler';
import { tileIndex } from '../../../shared/game/world';
import { getSettlerMovementStepIndex } from './settlerFacing';

export { getSettlerRenderFacing } from './settlerFacing';

export function isSettlerHiddenInHouse(settler: Settler) {
    return settler.activity === 'sleeping'
        || (!!settler.hiddenWhileWorking && (settler.activity === 'working' || settler.activity === 'repairing'));
}

export function isSettlerVisibleOnMap(settler: Settler) {
    return !isSettlerHiddenInHouse(settler);
}

export function getSettlerRenderCoords(settler: Settler) {
    if (!settler.movement && settler.workTileId && (settler.activity === 'working' || settler.activity === 'repairing')) {
        const workTile = tileIndex[settler.workTileId];
        if (workTile) {
            return { q: workTile.q, r: workTile.r };
        }
    }

    return { q: settler.q, r: settler.r };
}

export function getSettlerInterpolatedPixelPosition(settler: Settler, now: number) {
    if (!settler.movement) {
        const renderCoords = getSettlerRenderCoords(settler);
        return axialToPixel(renderCoords.q, renderCoords.r);
    }
    const movement = settler.movement;
    const elapsed = now - movement.startMs;
    if (elapsed < 0) return axialToPixel(movement.origin.q, movement.origin.r);
    if (!movement.path.length || !movement.cumulative.length) {
        return axialToPixel(settler.q, settler.r);
    }

    const total = movement.cumulative[movement.cumulative.length - 1]!;
    if (elapsed >= total) return axialToPixel(movement.target.q, movement.target.r);

    const stepIndex = getSettlerMovementStepIndex(movement, elapsed) ?? 0;

    const prevEnd = stepIndex === 0 ? 0 : movement.cumulative[stepIndex - 1]!;
    const stepElapsed = elapsed - prevEnd;
    const stepDuration = movement.stepDurations[stepIndex] as number;
    const progress = Math.min(1, Math.max(0, stepElapsed / stepDuration));
    const from = stepIndex === 0 ? movement.origin : movement.path[stepIndex - 1];
    const to = movement.path[stepIndex];
    if (!from || !to) return axialToPixel(settler.q, settler.r);

    const fromPx = axialToPixel(from.q, from.r);
    const toPx = axialToPixel(to.q, to.r);

    return {
        x: fromPx.x + ((toPx.x - fromPx.x) * progress),
        y: fromPx.y + ((toPx.y - fromPx.y) * progress),
    };
}

export function computeTileSettlerOffsets(list: readonly Settler[]) {
    const offsets: Record<string, { x: number; y: number }> = {};
    const count = list.length;
    if (count <= 0) {
        return offsets;
    }

    const radius = count === 1 ? 0 : Math.min(12, 4 + (count * 2));
    for (let index = 0; index < count; index++) {
        const settler = list[index]!;
        if (count === 1) {
            offsets[settler.id] = { x: -6, y: 7 };
            continue;
        }

        const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / count);
        offsets[settler.id] = {
            x: Math.round(Math.cos(angle) * radius) - 6,
            y: Math.round(Math.sin(angle) * (radius * 0.55)) + 7,
        };
    }

    return offsets;
}

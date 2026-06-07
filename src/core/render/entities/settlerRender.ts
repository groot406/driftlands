import { axialToPixel } from '../../camera';
import type { Settler } from '../../types/Settler';
import { tileIndex } from '../../../shared/game/world';
import { getSettlerMovementStepIndex } from './settlerFacing';

export { getSettlerRenderFacing } from './settlerFacing';

export function isSettlerActiveWorkAnimation(settler: Settler) {
    return settler.activity === 'working'
        || settler.activity === 'repairing'
        || settler.activity === 'defending'
        || settler.activity === 'raiding';
}

export function isSettlerHiddenInHouse(settler: Settler) {
    return settler.activity === 'sleeping'
        || (!!settler.hiddenWhileWorking && isSettlerActiveWorkAnimation(settler));
}

export function isSettlerVisibleOnMap(settler: Settler) {
    return !isSettlerHiddenInHouse(settler);
}

export function getSettlerCombatHealthBar(settler: Settler) {
    const maxHealth = settler.combatHealthMax ?? 0;
    if (maxHealth <= 0 || settler.combatHealth === null || settler.combatHealth === undefined) {
        return null;
    }

    const health = Math.max(0, Math.min(maxHealth, settler.combatHealth));
    if (health >= maxHealth) {
        return null;
    }

    return {
        percent: Math.round((health / maxHealth) * 100),
    };
}

interface WatchtowerArrowPoint {
    x: number;
    y: number;
}

export interface WatchtowerArrowStreak {
    tail: WatchtowerArrowPoint;
    head: WatchtowerArrowPoint;
    angle: number;
    alpha: number;
    sparkAlpha: number;
}

export function getWatchtowerArrowStreak(options: {
    source: WatchtowerArrowPoint;
    target: WatchtowerArrowPoint;
    now: number;
    seed: number;
}): WatchtowerArrowStreak | null {
    const { source, target, now, seed } = options;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) {
        return null;
    }

    const cycleMs = 620;
    const phase = ((((now + (seed * 97)) % cycleMs) + cycleMs) % cycleMs) / cycleMs;
    if (phase > 0.88) {
        return null;
    }

    const travel = 0.1 + ((phase / 0.88) * 0.84);
    const trailLengthPx = Math.min(20, Math.max(11, distance * 0.075));
    const tailT = Math.max(0, travel - (trailLengthPx / distance));
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const curveDirection = Math.abs(seed) % 2 === 0 ? -1 : 1;
    const curveOffset = Math.min(18, distance * 0.06) * curveDirection;
    const verticalLift = Math.min(16, 9 + (distance * 0.03));
    const control = {
        x: source.x + (dx * 0.5) + (normalX * curveOffset),
        y: source.y + (dy * 0.5) + (normalY * curveOffset) - verticalLift,
    };
    const pointAt = (t: number) => {
        const inv = 1 - t;
        return {
            x: (inv * inv * source.x) + (2 * inv * t * control.x) + (t * t * target.x),
            y: (inv * inv * source.y) + (2 * inv * t * control.y) + (t * t * target.y),
        };
    };
    const tail = pointAt(tailT);
    const head = pointAt(travel);
    const tangent = pointAt(Math.max(0, travel - 0.025));
    const alpha = phase < 0.08
        ? phase / 0.08
        : phase > 0.74
            ? Math.max(0, (0.88 - phase) / 0.14)
            : 1;

    return {
        tail,
        head,
        angle: Math.atan2(head.y - tangent.y, head.x - tangent.x),
        alpha,
        sparkAlpha: Math.max(0, phase - 0.68) / 0.2,
    };
}

export function getSettlerRenderCoords(settler: Settler) {
    if (!settler.movement && settler.workTileId && isSettlerActiveWorkAnimation(settler)) {
        const workTile = tileIndex[settler.workTileId];
        if (workTile) {
            return { q: workTile.q, r: workTile.r };
        }
    }

    return { q: settler.q, r: settler.r };
}

export function getSettlerVisibilityCoords(settler: Settler, now: number) {
    if (!settler.movement) {
        return getSettlerRenderCoords(settler);
    }

    const movement = settler.movement;
    const elapsed = now - movement.startMs;
    if (elapsed < 0 || !movement.path.length || !movement.cumulative.length) {
        return movement.origin;
    }

    const total = movement.cumulative[movement.cumulative.length - 1]!;
    if (elapsed >= total) {
        return movement.target;
    }

    const stepIndex = getSettlerMovementStepIndex(movement, elapsed) ?? 0;
    const prevEnd = stepIndex === 0 ? 0 : movement.cumulative[stepIndex - 1]!;
    const stepElapsed = elapsed - prevEnd;
    const stepDuration = movement.stepDurations[stepIndex] as number;
    const progress = Math.min(1, Math.max(0, stepElapsed / stepDuration));
    const from = stepIndex === 0 ? movement.origin : movement.path[stepIndex - 1];
    const to = movement.path[stepIndex];
    if (!from || !to) {
        return movement.target;
    }

    return {
        q: from.q + ((to.q - from.q) * progress),
        r: from.r + ((to.r - from.r) * progress),
    };
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

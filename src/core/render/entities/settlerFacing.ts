import type { Settler } from '../../types/Settler';

type SettlerMovement = NonNullable<Settler['movement']>;

export function getSettlerMovementStepIndex(movement: SettlerMovement, elapsed: number) {
    if (!movement.path.length) {
        return null;
    }

    if (elapsed < 0) {
        return 0;
    }

    let stepIndex = 0;
    while (stepIndex < movement.cumulative.length && elapsed >= movement.cumulative[stepIndex]!) {
        stepIndex++;
    }

    return Math.min(stepIndex, movement.path.length - 1);
}

function facingFromStep(from: { q: number; r: number }, to: { q: number; r: number }): Settler['facing'] | null {
    const dq = to.q - from.q;
    const dr = to.r - from.r;
    if (dr < 0) {
        return 'up';
    }
    if (dr > 0) {
        return 'down';
    }
    if (dq > 0) {
        return 'right';
    }
    if (dq < 0) {
        return 'left';
    }

    return null;
}

export function getSettlerRenderFacing(settler: Settler, now: number): Settler['facing'] {
    const movement = settler.movement;
    if (!movement) {
        return settler.facing;
    }

    const elapsed = now - movement.startMs;
    const stepIndex = getSettlerMovementStepIndex(movement, elapsed);
    if (stepIndex === null) {
        return settler.facing;
    }

    const from = stepIndex === 0 ? movement.origin : movement.path[stepIndex - 1];
    const to = movement.path[stepIndex];
    if (!from || !to) {
        return settler.facing;
    }

    return facingFromStep(from, to) ?? settler.facing;
}

import { reactive, ref } from 'vue';
import { broadcastGameMessage as broadcast } from '../shared/game/runtime';
import type { Settler } from '../core/types/Settler';

function cloneMovement(
    movement: Settler['movement'],
    serverTimestamp?: number,
) {
    if (!movement) {
        return undefined;
    }

    const cloned = {
        path: movement.path.map((step) => ({ ...step })),
        origin: { ...movement.origin },
        target: { ...movement.target },
        startMs: movement.startMs,
        stepDurations: movement.stepDurations.slice(),
        cumulative: movement.cumulative.slice(),
        taskType: movement.taskType,
        requestId: movement.requestId,
        authoritative: movement.authoritative,
    };

    if (typeof serverTimestamp === 'number') {
        const elapsedAtSend = serverTimestamp - movement.startMs;
        cloned.startMs = Date.now() - elapsedAtSend;
    }

    return cloned;
}

function cloneSettler(
    settler: Settler,
    previous?: Settler,
    serverTimestamp?: number,
): Settler {
    return {
        ...previous,
        ...settler,
        movement: cloneMovement(settler.movement, serverTimestamp),
        assignedRole: settler.assignedRole ?? null,
        workTileId: settler.workTileId ?? null,
        hiddenWhileWorking: settler.hiddenWhileWorking ?? null,
        blockerReason: settler.blockerReason ? { ...settler.blockerReason } : null,
        carryingKind: settler.carryingKind ?? null,
        carryingPayload: settler.carryingPayload ? { ...settler.carryingPayload } : undefined,
    };
}

export const settlers = reactive<Settler[]>([]);
export const settlerVersion = ref(0);

export function getSettler(id: string) {
    return settlers.find((settler) => settler.id === id) ?? null;
}

export function resetSettlerState() {
    settlers.length = 0;
    settlerVersion.value++;
}

export function loadSettlers(nextSettlers: Settler[], serverTimestamp?: number) {
    const previousById = new Map(settlers.map((settler) => [settler.id, settler]));

    settlers.length = 0;
    for (const settler of nextSettlers) {
        settlers.push(cloneSettler(settler, previousById.get(settler.id), serverTimestamp));
    }

    settlerVersion.value++;
}

export function updateSettlers(nextSettlers: Settler[], serverTimestamp?: number) {
    loadSettlers(nextSettlers, serverTimestamp);
}

export function getSettlerSnapshot(): Settler[] {
    return settlers.map((settler) => cloneSettler(settler));
}

export function broadcastSettlersState(timestamp: number = Date.now()) {
    broadcast({
        type: 'settlers:update',
        settlers: getSettlerSnapshot(),
        timestamp,
    });
}

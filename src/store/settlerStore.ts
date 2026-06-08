import { reactive, ref } from 'vue';
import { broadcastGameMessage as broadcast } from '../shared/game/runtime';
import type { Settler } from '../core/types/Settler';
import { normalizeSettlerGender } from '../shared/game/settlerNames.ts';
import { normalizeDrinkPreference, normalizeSettlerTraits } from '../shared/game/settlerPreferences.ts';

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
        gender: normalizeSettlerGender(settler),
        movement: cloneMovement(settler.movement, serverTimestamp),
        assignedRole: settler.assignedRole ?? null,
        guardTowerTileId: settler.guardTowerTileId ?? null,
        workTileId: settler.workTileId ?? null,
        hiddenWhileWorking: settler.hiddenWhileWorking ?? null,
        fieldWork: settler.fieldWork ? { ...settler.fieldWork } : null,
        blockerReason: settler.blockerReason ? { ...settler.blockerReason } : null,
        carryingKind: settler.carryingKind ?? null,
        happiness: settler.happiness ?? 100,
        traits: normalizeSettlerTraits(settler),
        drinkPreference: normalizeDrinkPreference(settler),
        socialTileId: settler.socialTileId ?? null,
        carryingPayload: settler.carryingPayload ? { ...settler.carryingPayload } : undefined,
        combatHealth: settler.combatHealth ?? null,
        combatHealthMax: settler.combatHealthMax ?? null,
    };
}

export const settlers = reactive<Settler[]>([]);
export const settlerVersion = ref(0);
let lastBroadcastSnapshot: Settler[] | null = null;

export function getSettler(id: string) {
    return settlers.find((settler) => settler.id === id) ?? null;
}

export function resetSettlerState() {
    settlers.length = 0;
    lastBroadcastSnapshot = null;
    settlerVersion.value++;
}

export function loadSettlers(nextSettlers: Settler[], serverTimestamp?: number) {
    const previousById = new Map(settlers.map((settler) => [settler.id, settler]));

    settlers.length = 0;
    for (const settler of nextSettlers) {
        settlers.push(cloneSettler(settler, previousById.get(settler.id), serverTimestamp));
    }

    lastBroadcastSnapshot = null;
    settlerVersion.value++;
}

export function updateSettlers(nextSettlers: Settler[], serverTimestamp?: number) {
    loadSettlers(nextSettlers, serverTimestamp);
}

export function applySettlersPatch(
    patch: { updates?: Settler[]; removedIds?: string[]; timestamp?: number },
) {
    let changed = false;
    const removedIds = new Set(patch.removedIds ?? []);
    if (removedIds.size > 0) {
        for (let index = settlers.length - 1; index >= 0; index--) {
            if (removedIds.has(settlers[index]!.id)) {
                settlers.splice(index, 1);
                changed = true;
            }
        }
    }

    for (const update of patch.updates ?? []) {
        const index = settlers.findIndex((settler) => settler.id === update.id);
        if (index >= 0) {
            settlers[index] = cloneSettler(update, settlers[index], patch.timestamp);
        } else {
            settlers.push(cloneSettler(update, undefined, patch.timestamp));
        }
        changed = true;
    }

    if (changed) {
        settlerVersion.value++;
    }
}

export function getSettlerSnapshot(): Settler[] {
    return settlers.map((settler) => cloneSettler(settler));
}

export function broadcastSettlersState(timestamp: number = Date.now()) {
    const snapshot = getSettlerSnapshot();
    lastBroadcastSnapshot = snapshot.map((settler) => cloneSettler(settler));
    broadcast({
        type: 'settlers:update',
        settlers: snapshot,
        timestamp,
    });
}

export function resetSettlerBroadcastBaseline() {
    lastBroadcastSnapshot = null;
}

export function broadcastSettlersPatchState(timestamp: number = Date.now()) {
    if (!lastBroadcastSnapshot) {
        broadcastSettlersState(timestamp);
        return;
    }

    const snapshot = getSettlerSnapshot();
    const previousById = new Map(lastBroadcastSnapshot.map((settler) => [settler.id, settler]));
    const currentIds = new Set(snapshot.map((settler) => settler.id));
    const updates = snapshot.filter((settler) => {
        const previous = previousById.get(settler.id);
        return !previous || JSON.stringify(previous) !== JSON.stringify(settler);
    });
    const removedIds = lastBroadcastSnapshot
        .filter((settler) => !currentIds.has(settler.id))
        .map((settler) => settler.id);

    lastBroadcastSnapshot = snapshot.map((settler) => cloneSettler(settler));
    if (!updates.length && !removedIds.length) {
        return;
    }

    broadcast({
        type: 'settlers:patch',
        updates,
        removedIds,
        timestamp,
    });
}

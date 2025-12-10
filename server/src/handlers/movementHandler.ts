import type {Server, Socket} from 'socket.io';
import {broadcast, serverMessageRouter} from '../messageRouter';
import type {MoveRequestMessage, PathUpdateMessage} from '../../../src/shared/protocol';
import {tiles} from '../../../src/core/world';
import {TERRAIN_DEFS} from '../../../src/core/terrainDefs';

function isWalkable(q: number, r: number): boolean {
    const t = tiles.find(t => t.q === q && t.r === r);
    if (!t || !t.terrain) return false;
    const def = (TERRAIN_DEFS)[t.terrain];
    const variantDef = t?.variant ? def.variations?.find((v: any) => v.key === t?.variant) : null;
    if (variantDef && typeof variantDef.walkable === 'boolean') {
        return !!variantDef.walkable;
    }
    return !!(def && def.walkable);
}

function computeDurations(path: { q: number; r: number }[], origin: { q: number; r: number }, speedAdj = 1): {
    durations: number[];
    cumulative: number[];
    avg: number
} {
    const baseStepMs = 750;
    const durations: number[] = [];
    for (let i = 0; i < path.length; i++) {
        const fromCoord = (i === 0) ? origin : path[i - 1]!;
        const toCoord = path[i]!;
        const fromTile = tiles.find(t => t.q === fromCoord.q && t.r === fromCoord.r);
        const toTile = tiles.find(t => t.q === toCoord.q && t.r === toCoord.r);
        const fromDef = fromTile && fromTile.terrain ? (TERRAIN_DEFS as any)[fromTile.terrain] : null;
        const toDef = toTile && toTile.terrain ? (TERRAIN_DEFS as any)[toTile.terrain] : null;
        const fromCost = fromDef && typeof fromDef.moveCost === 'number' ? fromDef.moveCost : 1;
        const toCost = toDef && typeof toDef.moveCost === 'number' ? toDef.moveCost : 1;
        const edgeCost = 0.5 * fromCost + 0.5 * toCost;
        durations.push(Math.min(Math.max(120, baseStepMs * edgeCost * speedAdj), 5000));
    }
    const cumulative: number[] = [];
    let acc = 0;
    for (const d of durations) {
        acc += d;
        cumulative.push(acc);
    }
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : baseStepMs;
    return {durations, cumulative, avg};
}

export class ServerMovementHandler {
    constructor(private io: Server) {
    }

    init(): void {
        serverMessageRouter.on('hero:move_request', this.handleMoveRequest.bind(this));
    }

    private handleMoveRequest(socket: Socket, message: MoveRequestMessage): void {
        const {heroId, origin, target, path: clientPath} = message;

        // Basic validation of origin/target
        if (!origin || !target) return;

        const targetTile = tiles.find(t => t.q === target.q && t.r === target.r);
        if (!isWalkable(target.q, target.r) && targetTile.discovered) return;

        // Compute or validate path with HexMapService
        let path: { q: number; r: number }[] = [];
        if (clientPath && Array.isArray(clientPath) && clientPath.length) {
            let valid = true;
            let prev = origin;
            for (const step of clientPath) {
                const dq = step.q - prev.q;
                const dr = step.r - prev.r;
                const isNeighbor = Math.abs(dq) <= 1 && Math.abs(dr) <= 1 && Math.abs(dq + dr) <= 1; // axial adjacency rough check
                const isTarget = (step.q === target.q && step.r === target.r);
                if (!isNeighbor || (!isTarget && !isWalkable(step.q, step.r))) {
                    valid = false;
                    break;
                }
                prev = step;
            }
            if (valid && prev.q === target.q && prev.r === target.r) {
                path = clientPath.slice();
            }
        }

        if (!path.length) return; // no path

        // Compute timings; in future incorporate hero stats from authoritative state
        const {durations, cumulative} = computeDurations(path, origin, 1);

        const startDelayMs = 50; // small delay for clients to align without time sync
        const update: PathUpdateMessage = {
            type: 'hero:path_update',
            heroId,
            origin,
            path,
            target,
            startDelayMs,
            stepDurations: durations,
            cumulative,
            task: message.task,
        };

        // Broadcast to all clients
        broadcast(this.io, update as any);
    }
}

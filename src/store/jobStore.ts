import { broadcastGameMessage as broadcast } from '../shared/game/runtime';
import type { SettlerBlockerReason } from '../core/types/Settler';

export type JobSiteStatus = 'staffed' | 'unstaffed' | 'offline' | 'paused' | 'missing_input' | 'storage_full' | 'depleted' | 'complete';

export interface JobSiteSnapshot {
    tileId: string;
    buildingKey: string;
    slots: number;
    assignedWorkers: number;
    status: JobSiteStatus;
    blockerReason?: SettlerBlockerReason | null;
}

export interface WorkforceSnapshot {
    availableWorkers: number;
    assignedWorkers: number;
    idleWorkers: number;
    sites: JobSiteSnapshot[];
}

interface WorkforceState extends WorkforceSnapshot {}

function cloneSite(site: JobSiteSnapshot): JobSiteSnapshot {
    return {
        tileId: site.tileId,
        buildingKey: site.buildingKey,
        slots: site.slots,
        assignedWorkers: site.assignedWorkers,
        status: site.status,
        blockerReason: site.blockerReason ? { ...site.blockerReason } : null,
    };
}

const state: WorkforceState = {
    availableWorkers: 0,
    assignedWorkers: 0,
    idleWorkers: 0,
    sites: [],
};

export function getWorkforceState(): Readonly<WorkforceState> {
    return state;
}

export function resetWorkforceState() {
    state.availableWorkers = 0;
    state.assignedWorkers = 0;
    state.idleWorkers = 0;
    state.sites = [];
}

export function setWorkforceSnapshot(snapshot: WorkforceSnapshot) {
    state.availableWorkers = snapshot.availableWorkers;
    state.assignedWorkers = snapshot.assignedWorkers;
    state.idleWorkers = snapshot.idleWorkers;
    state.sites = snapshot.sites.map(cloneSite);
}

export function loadWorkforceSnapshot(snapshot: WorkforceSnapshot) {
    setWorkforceSnapshot(snapshot);
}

export function getWorkforceSnapshot(): WorkforceSnapshot {
    return {
        availableWorkers: state.availableWorkers,
        assignedWorkers: state.assignedWorkers,
        idleWorkers: state.idleWorkers,
        sites: state.sites.map(cloneSite),
    };
}

export function broadcastWorkforceState() {
    const snapshot = getWorkforceSnapshot();
    broadcast({
        type: 'jobs:update',
        availableWorkers: snapshot.availableWorkers,
        assignedWorkers: snapshot.assignedWorkers,
        idleWorkers: snapshot.idleWorkers,
        sites: snapshot.sites,
    });
}

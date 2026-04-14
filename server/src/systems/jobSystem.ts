import type { TickContext } from '../tick';
import {
    broadcastWorkforceState,
    getWorkforceSnapshot,
    setWorkforceSnapshot,
    type JobSiteSnapshot,
    type WorkforceSnapshot,
} from '../../../src/shared/game/state/jobStore';
import { getPopulationState } from '../../../src/shared/game/state/populationStore';
import { settlers } from '../../../src/shared/game/state/settlerStore';
import { listResolvedJobSites, resolveSiteStatus } from './jobSiteRuntime';

function getAvailableWorkers() {
    const population = getPopulationState();
    return Math.max(0, Math.min(population.current, settlers.length));
}

function createSnapshot(): WorkforceSnapshot {
    const sites = listResolvedJobSites();
    const availableWorkers = getAvailableWorkers();
    const assignableSettlers = settlers
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, availableWorkers);
    const assignedCounts = new Map<string, number>();

    for (const settler of assignableSettlers) {
        if (!settler.assignedWorkTileId) {
            continue;
        }

        assignedCounts.set(
            settler.assignedWorkTileId,
            (assignedCounts.get(settler.assignedWorkTileId) ?? 0) + 1,
        );
    }

    const siteSnapshots = sites.map((site): JobSiteSnapshot => {
        const assignedWorkers = Math.min(site.slots, assignedCounts.get(site.tile.id) ?? 0);

        return {
            tileId: site.tile.id,
            buildingKey: site.building.key,
            slots: site.slots,
            assignedWorkers,
            status: resolveSiteStatus(site, assignedWorkers),
        };
    });

    const assignedWorkers = siteSnapshots.reduce((sum, site) => sum + site.assignedWorkers, 0);

    return {
        availableWorkers,
        assignedWorkers,
        idleWorkers: Math.max(0, availableWorkers - assignedWorkers),
        sites: siteSnapshots,
    };
}

function snapshotsEqual(a: WorkforceSnapshot, b: WorkforceSnapshot) {
    if (a.availableWorkers !== b.availableWorkers
        || a.assignedWorkers !== b.assignedWorkers
        || a.idleWorkers !== b.idleWorkers
        || a.sites.length !== b.sites.length) {
        return false;
    }

    for (let index = 0; index < a.sites.length; index++) {
        const siteA = a.sites[index]!;
        const siteB = b.sites[index]!;
        if (siteA.tileId !== siteB.tileId
            || siteA.buildingKey !== siteB.buildingKey
            || siteA.slots !== siteB.slots
            || siteA.assignedWorkers !== siteB.assignedWorkers
            || siteA.status !== siteB.status) {
            return false;
        }
    }

    return true;
}

export const jobSystem = {
    name: 'jobs',

    init: () => {
        setWorkforceSnapshot(createSnapshot());
    },

    tick: (_ctx: TickContext) => {
        const previousSnapshot = getWorkforceSnapshot();
        const nextSnapshot = createSnapshot();
        setWorkforceSnapshot(nextSnapshot);

        if (!snapshotsEqual(previousSnapshot, nextSnapshot)) {
            broadcastWorkforceState();
        }
    },
};

export function refreshWorkforceState() {
    const previousSnapshot = getWorkforceSnapshot();
    const nextSnapshot = createSnapshot();
    setWorkforceSnapshot(nextSnapshot);

    if (!snapshotsEqual(previousSnapshot, nextSnapshot)) {
        broadcastWorkforceState();
    }
}

export function resetJobSiteRuntime(_tileId: string) {}

import { reactive, ref } from 'vue';
import type { WorkforceSnapshot } from './jobStore';

interface ClientWorkforceState extends WorkforceSnapshot {}

function cloneSites(snapshot: WorkforceSnapshot | null | undefined) {
    return snapshot?.sites?.map((site) => ({ ...site })) ?? [];
}

export const workforceState: ClientWorkforceState = reactive({
    availableWorkers: 0,
    assignedWorkers: 0,
    idleWorkers: 0,
    sites: [],
});

export const workforceVersion = ref(0);

export function loadWorkforce(snapshot: WorkforceSnapshot) {
    workforceState.availableWorkers = snapshot.availableWorkers;
    workforceState.assignedWorkers = snapshot.assignedWorkers;
    workforceState.idleWorkers = snapshot.idleWorkers;
    workforceState.sites = cloneSites(snapshot);
    workforceVersion.value++;
}

export function updateWorkforce(snapshot: WorkforceSnapshot) {
    workforceState.availableWorkers = snapshot.availableWorkers;
    workforceState.assignedWorkers = snapshot.assignedWorkers;
    workforceState.idleWorkers = snapshot.idleWorkers;
    workforceState.sites = cloneSites(snapshot);
    workforceVersion.value++;
}

export function resetClientWorkforceState() {
    workforceState.availableWorkers = 0;
    workforceState.assignedWorkers = 0;
    workforceState.idleWorkers = 0;
    workforceState.sites = [];
    workforceVersion.value++;
}

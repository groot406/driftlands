import { reactive, ref } from 'vue';
import type { PopulationSnapshot } from '../store/populationStore';
import { syncSettlementSupportSnapshot } from './settlementSupportStore';

// Client-side reactive population state
interface ClientPopulationState {
    current: number;
    max: number;
    beds: number;
    hungerMs: number;
    supportCapacity: number;
    activeTileCount: number;
    inactiveTileCount: number;
    pressureState: PopulationSnapshot['pressureState'];
    settlements: PopulationSnapshot['settlements'];
}

export const populationState: ClientPopulationState = reactive({
    current: 0,
    max: 0,
    beds: 0,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
});

export const populationVersion = ref(0);

export function loadPopulation(snapshot: PopulationSnapshot) {
    populationState.current = snapshot.current;
    populationState.max = snapshot.max;
    populationState.beds = snapshot.beds ?? 0;
    populationState.hungerMs = snapshot.hungerMs;
    populationState.supportCapacity = snapshot.supportCapacity ?? 0;
    populationState.activeTileCount = snapshot.activeTileCount ?? 0;
    populationState.inactiveTileCount = snapshot.inactiveTileCount ?? 0;
    populationState.pressureState = snapshot.pressureState ?? 'stable';
    populationState.settlements = snapshot.settlements?.map((settlement) => ({ ...settlement })) ?? [];
    syncSettlementSupportSnapshot(snapshot);
    populationVersion.value++;
}

export function updatePopulation(snapshot: PopulationSnapshot) {
    populationState.current = snapshot.current;
    populationState.max = snapshot.max;
    populationState.beds = snapshot.beds;
    populationState.hungerMs = snapshot.hungerMs;
    populationState.supportCapacity = snapshot.supportCapacity ?? 0;
    populationState.activeTileCount = snapshot.activeTileCount ?? 0;
    populationState.inactiveTileCount = snapshot.inactiveTileCount ?? 0;
    populationState.pressureState = snapshot.pressureState ?? 'stable';
    populationState.settlements = snapshot.settlements?.map((settlement) => ({ ...settlement })) ?? [];
    syncSettlementSupportSnapshot(snapshot);
    populationVersion.value++;
}

export function resetClientPopulationState() {
    populationState.current = 0;
    populationState.max = 0;
    populationState.beds = 0;
    populationState.hungerMs = 0;
    populationState.supportCapacity = 0;
    populationState.activeTileCount = 0;
    populationState.inactiveTileCount = 0;
    populationState.pressureState = 'stable';
    populationState.settlements = [];
    syncSettlementSupportSnapshot(null);
    populationVersion.value++;
}

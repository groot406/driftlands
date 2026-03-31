import { reactive, ref } from 'vue';
import type { PopulationSnapshot } from '../store/populationStore';

// Client-side reactive population state
interface ClientPopulationState {
    current: number;
    max: number;
    beds: number;
    hungerMs: number;
}

export const populationState: ClientPopulationState = reactive({
    current: 0,
    max: 0,
    beds: 0,
    hungerMs: 0,
});

export const populationVersion = ref(0);

export function loadPopulation(snapshot: PopulationSnapshot) {
    populationState.current = snapshot.current;
    populationState.max = snapshot.max;
    populationState.beds = snapshot.beds ?? 0;
    populationState.hungerMs = snapshot.hungerMs;
    populationVersion.value++;
}

export function updatePopulation(current: number, max: number, beds: number, hungerMs: number) {
    populationState.current = current;
    populationState.max = max;
    populationState.beds = beds;
    populationState.hungerMs = hungerMs;
    populationVersion.value++;
}

export function resetClientPopulationState() {
    populationState.current = 0;
    populationState.max = 0;
    populationState.beds = 0;
    populationState.hungerMs = 0;
    populationVersion.value++;
}

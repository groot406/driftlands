import type { TickContext } from '../tick';
import {
    getPopulationState,
    growPopulation,
    killSettler,
    setHungerMs,
    FOOD_PER_SETTLER_PER_MINUTE,
    HUNGER_GRACE_MINUTES,
} from '../../../src/shared/game/state/populationStore';
import { resourceInventory, withdrawResource } from '../../../src/shared/game/state/resourceStore';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';

/**
 * Food consumption interval in ms (1 minute = 60000ms).
 * Each interval, every settler consumes FOOD_PER_SETTLER_PER_MINUTE food.
 */
const FOOD_TICK_INTERVAL_MS = 60_000;

/** Hunger death threshold in ms. */
const HUNGER_DEATH_THRESHOLD_MS = HUNGER_GRACE_MINUTES * 60_000;

let lastFoodTickMs = 0;

export const populationSystem = {
    name: 'population',

    init: () => {
        lastFoodTickMs = Date.now();
    },

    tick: (ctx: TickContext) => {
        const state = getPopulationState();
        if (state.current <= 0) return;

        const elapsed = ctx.now - lastFoodTickMs;
        if (elapsed < FOOD_TICK_INTERVAL_MS) return;

        lastFoodTickMs = ctx.now;

        // Calculate food needed this tick
        const foodNeeded = state.current * FOOD_PER_SETTLER_PER_MINUTE;
        const foodAvailable = resourceInventory.food ?? 0;

        if (foodAvailable >= foodNeeded) {
            // Consume food — withdraw from global inventory
            withdrawResource('food', foodNeeded);

            // Reset hunger if we had any
            if (state.hungerMs > 0) {
                setHungerMs(0);
                broadcastPopulation(state);
            }

            // Attempt passive population growth (requires beds from houses)
            if (growPopulation()) {
                broadcastPopulation(getPopulationState());
            }
        } else {
            // Consume whatever food is available
            if (foodAvailable > 0) {
                withdrawResource('food', foodAvailable);
            }

            // Accumulate hunger
            setHungerMs(state.hungerMs + FOOD_TICK_INTERVAL_MS);

            // Check for starvation death
            if (state.hungerMs >= HUNGER_DEATH_THRESHOLD_MS) {
                killSettler();
                setHungerMs(0); // Reset hunger timer after death
            }

            broadcastPopulation(state);
        }
    },
};

function broadcastPopulation(state: ReturnType<typeof getPopulationState>) {
    broadcast({
        type: 'population:update',
        current: state.current,
        max: state.max,
        beds: state.beds,
        hungerMs: state.hungerMs,
    });
}

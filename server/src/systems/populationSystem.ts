import type { TickContext } from '../tick';
import {
    getPopulationState,
    growPopulation,
    killSettler,
    setHungerMs,
    FOOD_PER_SETTLER_PER_MINUTE,
    HUNGER_GRACE_MINUTES,
} from '../../../src/shared/game/state/populationStore';
import {
    resourceInventory,
    withdrawResourceAcrossStorages,
    type StorageResourceTransfer,
} from '../../../src/shared/game/state/resourceStore';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';
import type { ResourceWithdrawMessage } from '../../../src/shared/protocol';

/**
 * Food consumption interval in ms (1 minute = 60000ms).
 * Each interval, every settler consumes FOOD_PER_SETTLER_PER_MINUTE food.
 */
const FOOD_TICK_INTERVAL_MS = 60_000;

/** Hunger death threshold in ms. */
const HUNGER_DEATH_THRESHOLD_MS = HUNGER_GRACE_MINUTES * 60_000;

let lastFoodTickMs = 0;

function canGrowAfterMeal(foodAvailable: number, foodNeeded: number) {
    const nextPopulationMeal = foodNeeded + FOOD_PER_SETTLER_PER_MINUTE;
    return foodAvailable >= (foodNeeded + nextPopulationMeal);
}

function broadcastFoodWithdrawals(transfers: StorageResourceTransfer[]) {
    for (const transfer of transfers) {
        if (transfer.amount <= 0) {
            continue;
        }

        broadcast({
            type: 'resource:withdraw',
            heroId: 'colony',
            storageTileId: transfer.storageTileId,
            resource: {
                type: 'food',
                amount: transfer.amount,
            },
        } satisfies ResourceWithdrawMessage);
    }
}

function consumeFood(amount: number) {
    const transfers = withdrawResourceAcrossStorages('food', amount);
    broadcastFoodWithdrawals(transfers);
    return transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
}

function applyHungerTick() {
    const state = getPopulationState();
    const nextHungerMs = state.hungerMs + FOOD_TICK_INTERVAL_MS;
    const settlerWillBeLost = nextHungerMs >= HUNGER_DEATH_THRESHOLD_MS;

    setHungerMs(settlerWillBeLost ? 0 : nextHungerMs);

    if (settlerWillBeLost) {
        if (!killSettler()) {
            broadcastPopulation(getPopulationState());
        }
        return;
    }

    broadcastPopulation(getPopulationState());
}

export const populationSystem = {
    name: 'population',

    init: () => {
        lastFoodTickMs = Date.now();
    },

    tick: (ctx: TickContext) => {
        const state = getPopulationState();
        if (state.current <= 0) return;

        const foodNeeded = state.current * FOOD_PER_SETTLER_PER_MINUTE;
        if (foodNeeded <= 0) {
            return;
        }

        const foodAvailable = resourceInventory.food ?? 0;
        if (state.hungerMs > 0 && foodAvailable >= foodNeeded) {
            const recoveredFood = consumeFood(foodNeeded);
            if (recoveredFood >= foodNeeded) {
                setHungerMs(0);
                lastFoodTickMs = ctx.now;
                broadcastPopulation(getPopulationState());
                return;
            }
        }

        const elapsed = ctx.now - lastFoodTickMs;
        if (elapsed < FOOD_TICK_INTERVAL_MS) return;

        lastFoodTickMs = ctx.now;

        if (foodAvailable >= foodNeeded) {
            const consumedFood = consumeFood(foodNeeded);
            if (consumedFood < foodNeeded) {
                applyHungerTick();
                return;
            }

            const wasHungry = state.hungerMs > 0;
            if (wasHungry) {
                setHungerMs(0);
            }

            const grew = canGrowAfterMeal(foodAvailable, foodNeeded)
                ? growPopulation()
                : false;
            if (wasHungry && !grew) {
                broadcastPopulation(getPopulationState());
            }
        } else {
            consumeFood(foodAvailable);
            applyHungerTick();
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
        supportCapacity: state.supportCapacity,
        activeTileCount: state.activeTileCount,
        inactiveTileCount: state.inactiveTileCount,
        pressureState: state.pressureState,
        settlements: state.settlements.map((settlement) => ({ ...settlement })),
    });
}

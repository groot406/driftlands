import { registerCropTasks } from './cropTasks.ts';

registerCropTasks({
    terrain: 'grain',
    resourceType: 'grain',
    seedTaskKey: 'seedGrain',
    seedLabel: 'Plant Grain',
    harvestTaskKey: 'harvestGrain',
    harvestLabel: 'Harvest Grain',
    plantedVariant: 'grain_planted',
    baseYield: 3,
});

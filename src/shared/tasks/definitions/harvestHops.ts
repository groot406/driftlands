import { registerCropTasks } from './cropTasks.ts';

registerCropTasks({
    terrain: 'hops',
    resourceType: 'hops',
    seedTaskKey: 'seedHops',
    seedLabel: 'Plant Hops',
    harvestTaskKey: 'harvestHops',
    harvestLabel: 'Harvest Hops',
    plantedVariant: 'hops_planted',
    baseYield: 2,
});

import { registerCropTasks } from './cropTasks.ts';

registerCropTasks({
    terrain: 'grapes',
    resourceType: 'grapes',
    seedTaskKey: 'seedGrapes',
    seedLabel: 'Plant Grapes',
    harvestTaskKey: 'harvestGrapes',
    harvestLabel: 'Harvest Grapes',
    plantedVariant: 'grapes_planted',
    baseYield: 2,
});

import type { HeroStat } from '../../core/types/Hero.ts';
import type { TaskDefinition, TaskType } from '../../core/types/Task.ts';

export const TASK_COMPLETION_XP_REWARDS: Partial<Record<TaskType, number>> = {
    explore: 3,
    activateRuins: 14,
    surveyTile: 8,

    chopWood: 0,
    gatherTimber: 0,
    collectRations: 0,
    dismantle: 0,

    breakDirtRock: 1,
    campfireRations: 1,
    clearRocks: 2,
    dig: 3,
    fishAtDock: 1,
    gatherSand: 1,
    harvestGrain: 1,
    harvestWaterLilies: 1,
    hunt: 1,
    mineOre: 1,
    removeTrunks: 2,

    convertToGrass: 7,
    irregateDirtTask: 7,
    placeWaterLilies: 8,
    plantTrees: 10,
    seedGrain: 7,
    tillLand: 5,

    buildBridge: 12,
    buildCampfire: 5,
    buildWell: 10,
    buildWatchtower: 10,
    buildTownCenter: 20,
    buildSupplyDepot: 10,
    buildDock: 10,
    buildLumberCamp: 8,
    buildGranary: 10,
    buildBakery: 9,
    buildOven: 9,
    buildWorkshop: 10,
    buildLibrary: 14,
    buildHouse: 8,
    buildQuarry: 9,
    buildMine: 9,
    buildRoad: 6,
    buildTunnel: 12,

    upgradeHouseToStone: 9,
    upgradeHouseToGlass: 12,
    upgradeDepotToWarehouse: 11,
    upgradeLumberCampToSawmill: 11,
    upgradeMineToReinforced: 11,
    upgradeRoadToStone: 8,
};

export function getTaskCompletionXpReward(taskType: TaskType) {
    const explicitReward = TASK_COMPLETION_XP_REWARDS[taskType];
    if (explicitReward !== undefined) return explicitReward;

    if (taskType.startsWith('upgrade')) return 10;
    if (taskType.startsWith('build')) return 8;

    return 1;
}

export function getTaskRewardedStats(definition: TaskDefinition, distance: number): Partial<Record<HeroStat, number>> {
    const explicitRewards: Partial<Record<HeroStat, number>> = definition.totalRewardedStats?.(distance) ?? {};

    return {
        ...explicitRewards,
        xp: explicitRewards.xp ?? getTaskCompletionXpReward(definition.key),
    };
}

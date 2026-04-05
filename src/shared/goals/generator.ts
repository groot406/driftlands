import type { ResourceType } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { ObjectiveBlueprint, ObjectiveReward, RunBlueprint, RunMutatorKey } from './types.ts';
import { createStoryProgression, getAvailableStoryTaskKeys, type StoryProgressionSnapshot } from '../story/progression.ts';
import { createStoryBeat } from '../story/storyMode.ts';

export interface RunGenerationMetrics {
  frontierDistance: number;
  population: number;
  activeTiles: number;
  inactiveTiles: number;
}

const MUTATORS: Record<RunMutatorKey, { name: string; description: string }> = {
  open_frontier: {
    name: 'Open Frontier',
    description: 'The charter favors broad scouting and fast, flexible expansion.',
  },
  timber_rush: {
    name: 'Timber Rush',
    description: 'A construction-heavy charter that rewards early wood and harbor work.',
  },
  prospectors_call: {
    name: "Prospector's Call",
    description: 'The expedition is chasing ore, making mining progress the heart of the run.',
  },
  foragers_feast: {
    name: "Forager's Feast",
    description: 'The colony expects strong food security before the next wave of settlers arrives.',
  },
  roadworks_drive: {
    name: 'Roadworks Drive',
    description: 'Surveyors want durable lanes, waystations, and cleaner overland routes before the frontier spreads any farther.',
  },
  new_hearths: {
    name: 'New Hearths',
    description: 'The charter is ready to found another town center and tie that district back into the colony.',
  },
};

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollBetween(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function getRoadTaskTarget(missionScale: number, baseTarget: number = 2) {
  return Math.max(baseTarget, baseTarget + Math.floor(missionScale / 2));
}

function scoreReward(points: number): ObjectiveReward {
  return {
    label: `+${points} score`,
    scoreBonus: points,
  };
}

function surveyObjective(target: number, rewardPoints: number): ObjectiveBlueprint {
  return {
    id: 'survey',
    title: 'Chart the perimeter',
    description: `Discover ${target} frontier tiles.`,
    kind: 'discover_tiles',
    required: true,
    target,
    reward: scoreReward(rewardPoints),
  };
}

function reachObjective(target: number, rewardPoints: number, required: boolean = true): ObjectiveBlueprint {
  return {
    id: `reach-ring-${target}`,
    title: `Reach frontier ring ${target}`,
    description: `Push the colony's explored frontier out to distance ${target} from the closest town center.`,
    kind: 'reach_distance',
    required,
    target,
    reward: scoreReward(rewardPoints),
  };
}

function populationObjective(target: number, rewardPoints: number, required: boolean = true): ObjectiveBlueprint {
  return {
    id: `grow-population-${target}`,
    title: `Grow population to ${target}`,
    description: `Reach a colony population of ${target} settlers by building houses and feeding your people.`,
    kind: 'reach_population',
    required,
    target,
    reward: scoreReward(rewardPoints),
  };
}

function activeTilesObjective(target: number, rewardPoints: number, required: boolean = false): ObjectiveBlueprint {
  return {
    id: `active-tiles-${target}`,
    title: `Hold ${target} active tiles`,
    description: `Keep ${target} non-towncenter tiles active by sustaining population support across the frontier.`,
    kind: 'reach_active_tiles',
    required,
    target,
    reward: scoreReward(rewardPoints),
  };
}

function restoreTilesObjective(target: number, rewardPoints: number, required: boolean = false): ObjectiveBlueprint {
  return {
    id: `restore-tiles-${target}`,
    title: `Restore ${target} frontier tile${target === 1 ? '' : 's'}`,
    description: `Bring ${target} inactive tile${target === 1 ? '' : 's'} back online from adjacent active ground.`,
    kind: 'restore_tiles',
    required,
    target,
    reward: scoreReward(rewardPoints),
  };
}

function deliverObjective(
  id: string,
  title: string,
  resourceType: ResourceType,
  target: number,
  rewardPoints: number,
  required: boolean = true,
): ObjectiveBlueprint {
  return {
    id,
    title,
    description: `Deliver ${target} ${resourceType} into colony storage.`,
    kind: 'deliver_resource',
    required,
    target,
    resourceType,
    reward: scoreReward(rewardPoints),
  };
}

function taskObjective(
  id: string,
  title: string,
  description: string,
  taskType: TaskType,
  target: number,
  rewardPoints: number,
  required: boolean = true,
): ObjectiveBlueprint {
  return {
    id,
    title,
    description,
    kind: 'complete_task',
    required,
    target,
    taskType,
    reward: scoreReward(rewardPoints),
  };
}

function hasUnlockedTask(progression: StoryProgressionSnapshot, taskKey: TaskType) {
  return getAvailableStoryTaskKeys(progression).includes(taskKey);
}

function canDeliverFood(progression: StoryProgressionSnapshot) {
  return (
    hasUnlockedTask(progression, 'buildBakery')
    || hasUnlockedTask(progression, 'buildDock')
  );
}

function canDeliverOre(progression: StoryProgressionSnapshot) {
  return hasUnlockedTask(progression, 'buildMine');
}

function getAvailableMutators(progression: StoryProgressionSnapshot): RunMutatorKey[] {
  const mutators: RunMutatorKey[] = ['open_frontier', 'timber_rush'];

  if (canDeliverFood(progression) && hasUnlockedTask(progression, 'buildGranary')) {
    mutators.push('foragers_feast');
  }

  if (canDeliverOre(progression)) {
    mutators.push('prospectors_call');
  }

  if (hasUnlockedTask(progression, 'buildSupplyDepot')) {
    mutators.push('roadworks_drive');
  }

  if (hasUnlockedTask(progression, 'buildTownCenter')) {
    mutators.push('new_hearths');
  }

  return mutators;
}

function createScoutingTaskObjective(progression: StoryProgressionSnapshot, missionScale: number) {
  if (hasUnlockedTask(progression, 'buildWatchtower')) {
    return taskObjective(
      'signal-post',
      'Raise a signal post',
      'Build 1 watchtower to secure the next scouting ring.',
      'buildWatchtower',
      1,
      75,
      false,
    );
  }

  return taskObjective(
    'trailworks',
    'Lay a frontier lane',
    `Build ${Math.max(2, 2 + Math.floor(missionScale / 2))} roads to keep the charter moving.`,
    'buildRoad',
    Math.max(2, 2 + Math.floor(missionScale / 2)),
    60,
    false,
  );
}

function createTimberTaskObjective(progression: StoryProgressionSnapshot) {
  if (hasUnlockedTask(progression, 'buildLumberCamp')) {
    return taskObjective(
      'timber-yard',
      'Secure a timber site',
      'Build 1 lumber camp so wood can keep flowing without stripping every grove.',
      'buildLumberCamp',
      1,
      75,
      false,
    );
  }

  return taskObjective(
    'first-grove',
    'Clear the first grove',
    'Complete 2 woodcutting orders to turn the first stands into usable stock.',
    'chopWood',
    2,
    60,
    false,
  );
}

function createHarborOrWaterObjective(progression: StoryProgressionSnapshot, missionScale: number) {
  if (hasUnlockedTask(progression, 'buildDock')) {
    return taskObjective(
      'harbor',
      'Prepare a landing point',
      'Build 1 dock from adjacent active shore to improve shoreline access.',
      'buildDock',
      1,
      90,
      false,
    );
  }

  if (hasUnlockedTask(progression, 'buildWell')) {
    return taskObjective(
      'waterworks',
      'Sink a field well',
      'Build 1 well so inland plots can hold together.',
      'buildWell',
      1,
      75,
      false,
    );
  }

  if (hasUnlockedTask(progression, 'harvestWaterLilies')) {
    return taskObjective(
      'shore-forage',
      'Forage the shallows',
      'Harvest 2 lily patches from shore or an existing lily path to stock materials for your first water bridge.',
      'harvestWaterLilies',
      2,
      60,
      false,
    );
  }

  return createScoutingTaskObjective(progression, missionScale);
}

function createFoodTaskObjective(progression: StoryProgressionSnapshot) {
  if (hasUnlockedTask(progression, 'buildGranary')) {
    return taskObjective(
      'granary',
      'Raise a granary',
      'Build 1 granary to keep grain flowing into the colony stores before the next charter lands.',
      'buildGranary',
      1,
      75,
    );
  }

  return taskObjective(
    'shore-forage',
    'Forage the shallows',
    'Harvest 2 lily patches from shore or an existing lily path to keep the water bridge crews supplied.',
    'harvestWaterLilies',
    2,
    60,
    false,
  );
}

function createTownCenterTaskObjective(required: boolean = true) {
  return taskObjective(
    'new-hearth',
    'Found a frontier town',
    'Build 1 town center to anchor a new district and reset the frontier around it.',
    'buildTownCenter',
    1,
    120,
    required,
  );
}

function injectSupportObjectives(
  objectives: ObjectiveBlueprint[],
  missionNumber: number,
  metrics: RunGenerationMetrics,
): ObjectiveBlueprint[] {
  if (missionNumber < 5) {
    return objectives;
  }

  const nextObjectives = objectives.map((objective) => ({ ...objective }));
  const activeTileTarget = metrics.activeTiles + (missionNumber <= 8 ? 4 : 6);
  const supportObjective = activeTilesObjective(activeTileTarget, missionNumber >= 9 ? 90 : 75, false);

  const replaceOptionalObjective = (replacement: ObjectiveBlueprint, preferredKinds: ObjectiveBlueprint['kind'][] = []) => {
    let replaceIndex = -1;

    if (preferredKinds.length > 0) {
      replaceIndex = nextObjectives.findIndex(
        (objective) => !objective.required && preferredKinds.includes(objective.kind),
      );
    }

    if (replaceIndex < 0) {
      replaceIndex = nextObjectives.findIndex((objective) => !objective.required);
    }

    if (replaceIndex >= 0) {
      nextObjectives.splice(replaceIndex, 1, replacement);
      return true;
    }

    return false;
  };

  const replacedSupportObjective = replaceOptionalObjective(supportObjective, ['reach_distance']);
  if (!replacedSupportObjective) {
    nextObjectives.push(supportObjective);
  }

  if (metrics.inactiveTiles > 0) {
    const restoreObjective = restoreTilesObjective(Math.min(2, metrics.inactiveTiles), 75, false);
    const replaced = replaceOptionalObjective(restoreObjective, ['deliver_resource', 'complete_task', 'reach_distance']);

    if (!replaced) {
      nextObjectives.push(restoreObjective);
    }
  }

  return nextObjectives;
}

// ---------------------------------------------------------------------------
// Hand-crafted tutorial missions (1-10)
// Each mission introduces the mechanics unlocked by that mission's progression
// step, with 3-4 focused objectives.
// ---------------------------------------------------------------------------

function tutorialMission1(): ObjectiveBlueprint[] {
  // Unlocks: h1, h2, explore, chopWood, clearRocks, breakDirtRock, buildRoad, convertToGrass
  // Terrains: plains, forest, dirt
  // Teaches: basic exploration, clearing land, building roads
  return [
    surveyObjective(30, 45),
    reachObjective(4, 60),
    taskObjective(
      'first-grove',
      'Clear the first grove',
      'Complete 2 woodcutting orders to turn the first stands into usable stock.',
      'chopWood',
      2,
      60,
    ),
    taskObjective(
      'first-road',
      'Lay the first road',
      'Build 1 road to connect the camp to the frontier.',
      'buildRoad',
      1,
      45,
      false,
    ),
  ];
}

function tutorialMission2(): ObjectiveBlueprint[] {
  // Unlocks: dock, house, harvestWaterLilies, plantTrees, removeTrunks
  // Terrains: water
  // Teaches: building structures, shoreline foraging, tree management
  return [
    surveyObjective(50, 45),
    taskObjective(
      'harbor',
      'Build a dock',
      'Build 1 dock from adjacent active shore to open the shoreline to fishing and landings.',
      'buildDock',
      1,
      75,
    ),
    taskObjective(
      'first-shelter',
      'Raise a house',
      'Build 1 house to shelter settlers and raise the population cap.',
      'buildHouse',
      1,
      75,
    ),
    taskObjective(
      'shore-forage',
      'Forage the shallows',
      'Harvest 2 water lily patches from shore or an existing lily path along the newly discovered shoreline.',
      'harvestWaterLilies',
      2,
      45,
      false,
    ),
  ];
}

function tutorialMission3(): ObjectiveBlueprint[] {
  // Unlocks: tillLand, seedGrain, harvestGrain
  // Terrains: grain
  // Teaches: the full farming cycle
  return [
    surveyObjective(80, 45),
    taskObjective(
      'till-fields',
      'Prepare the fields',
      'Till 2 plots of land to create workable farm ground.',
      'tillLand',
      2,
      60,
    ),
    taskObjective(
      'plant-grain',
      'Sow the first seeds',
      'Plant seeds on 2 prepared plots to establish grain fields.',
      'seedGrain',
      2,
      60,
    ),
    deliverObjective('first-harvest', 'Bring in the harvest', 'grain', 8, 75),
  ];
}

function tutorialMission4(): ObjectiveBlueprint[] {
  // Unlocks: h3, well, irregateDirtTask
  // Teaches: water management, irrigation, expanding the workforce
  return [
    surveyObjective(100, 45),
    taskObjective(
      'sink-well',
      'Sink a well',
      'Build 1 well to bring water inland for irrigation.',
      'buildWell',
      1,
      75,
    ),
    taskObjective(
      'irrigate',
      'Irrigate dry land',
      'Irrigate 2 dry plots to turn parched earth into productive ground.',
      'irregateDirtTask',
      2,
      60,
    ),
    deliverObjective('wood-for-works', 'Stock the waterworks', 'wood', 15, 45, false),
  ];
}

function tutorialMission5(): ObjectiveBlueprint[] {
  // Unlocks: watchtower, granary, bakery
  // Teaches: food security, staffed production, scouting infrastructure
  return [
    surveyObjective(125, 45),
    taskObjective(
      'watchtower',
      'Raise a watchtower',
      'Build 1 watchtower to reveal nearby frontier and secure the perimeter.',
      'buildWatchtower',
      1,
      75,
    ),
    taskObjective(
      'granary',
      'Build a granary',
      'Build 1 granary to turn a grain field into steady stored grain for the colony.',
      'buildGranary',
      1,
      75,
    ),
    taskObjective(
      'bakery',
      'Build a bakery',
      'Build 1 bakery so stored grain can be turned into food by assigned settlers.',
      'buildBakery',
      1,
      75,
    ),
    deliverObjective('food-stores', 'Fill the food stores', 'food', 10, 60, false),
  ];
}

function tutorialMission6(): ObjectiveBlueprint[] {
  // Unlocks: mine
  // Terrains: mountain
  // Teaches: mining industry
  return [
    surveyObjective(150, 45),
    reachObjective(6, 60),
    taskObjective(
      'mine-head',
      'Establish a mine',
      'Build 1 mine in the mountain ridges to start ore production.',
      'buildMine',
      1,
      75,
    ),
    deliverObjective('first-ore', 'Ship the first ore', 'ore', 12, 75),
  ];
}

function tutorialMission7(): ObjectiveBlueprint[] {
  // Unlocks: h4, supplyDepot, lumberCamp
  // Teaches: logistics, staffed timber production
  return [
    surveyObjective(175, 45),
    taskObjective(
      'supply-depot',
      'Stage a supply depot',
      'Build 1 supply depot to create a forward warehouse for materials.',
      'buildSupplyDepot',
      1,
      75,
    ),
    taskObjective(
      'lumber-camp',
      'Establish a lumber camp',
      'Build 1 lumber camp to turn a forest tile into a permanent timber site.',
      'buildLumberCamp',
      1,
      75,
    ),
    deliverObjective('timber-haul', 'Gather sustainable timber', 'wood', 20, 60, false),
  ];
}

function tutorialMission8(currentFrontierDistance: number): ObjectiveBlueprint[] {
  // Unlocks: snow, dessert terrains (no new buildings/tasks)
  // Teaches: working in harsh conditions with existing toolkit
  return [
    surveyObjective(200, 45),
    reachObjective(Math.max(8, currentFrontierDistance + 2), 75),
    deliverObjective('harsh-timber', 'Stockpile for the cold', 'wood', 24, 60),
    deliverObjective('harsh-rations', 'Provision against the elements', 'food', 14, 60, false),
  ];
}

function tutorialMission9(_currentFrontierDistance: number): ObjectiveBlueprint[] {
  // Unlocks: townCenter
  // Teaches: founding a second settlement
  return [
    surveyObjective(225, 45),
    createTownCenterTaskObjective(),
    taskObjective(
      'settlers-road',
      'Connect the new district',
      'Build 3 roads to bind the new town center back into the colony.',
      'buildRoad',
      3,
      75,
    ),
    populationObjective(3, 60, false),
  ];
}

function tutorialMission10(currentFrontierDistance: number): ObjectiveBlueprint[] {
  // Unlocks: vulcano terrain
  // Teaches: final frontier push, uses all mechanics
  return [
    surveyObjective(250, 45),
    reachObjective(Math.max(10, currentFrontierDistance + 3), 90),
    deliverObjective('expedition-ore', 'Ore for the final push', 'ore', 18, 75),
    deliverObjective('expedition-food', 'Provision the expedition', 'food', 16, 60, false),
  ];
}

function getTutorialMissionObjectives(missionNumber: number, currentFrontierDistance: number): ObjectiveBlueprint[] {
  switch (missionNumber) {
    case 1: return tutorialMission1();
    case 2: return tutorialMission2();
    case 3: return tutorialMission3();
    case 4: return tutorialMission4();
    case 5: return tutorialMission5();
    case 6: return tutorialMission6();
    case 7: return tutorialMission7();
    case 8: return tutorialMission8(currentFrontierDistance);
    case 9: return tutorialMission9(currentFrontierDistance);
    case 10: return tutorialMission10(currentFrontierDistance);
    default: return tutorialMission1();
  }
}

/** Fixed mutator assigned to each tutorial mission (no RNG). */
function getTutorialMutator(missionNumber: number): RunMutatorKey {
  switch (missionNumber) {
    case 1: return 'open_frontier';
    case 2: return 'timber_rush';
    case 3: return 'open_frontier';
    case 4: return 'open_frontier';
    case 5: return 'foragers_feast';
    case 6: return 'prospectors_call';
    case 7: return 'roadworks_drive';
    case 8: return 'open_frontier';
    case 9: return 'new_hearths';
    case 10: return 'open_frontier';
    default: return 'open_frontier';
  }
}

// ---------------------------------------------------------------------------
// Procedural missions (11+)
// Uses the existing mutator-based generation with random objectives.
// ---------------------------------------------------------------------------

function generateProceduralMission(
  rng: () => number,
  progression: StoryProgressionSnapshot,
  metrics: RunGenerationMetrics,
): { mutatorKey: RunMutatorKey; objectives: ObjectiveBlueprint[] } {
  const mutatorKeys = getAvailableMutators(progression);
  const selectedMutator = mutatorKeys[Math.floor(rng() * mutatorKeys.length)] ?? 'open_frontier';
  const missionScale = Math.max(0, progression.missionNumber - 1);
  const surveyTarget = rollBetween(rng, 18, 24) + (missionScale * 25);
  const woodTarget = rollBetween(rng, 18, 28) + (missionScale * 4);
  const foodTarget = rollBetween(rng, 10, 18) + (missionScale * 3);
  const oreTarget = rollBetween(rng, 14, 24) + (missionScale * 4);
  const frontierRingTarget = Math.max(6 + missionScale, metrics.frontierDistance + 3 + Math.floor(missionScale / 2));

  let objectives: ObjectiveBlueprint[];

  switch (selectedMutator) {
    case 'timber_rush':
      objectives = [
        surveyObjective(surveyTarget, 45),
        deliverObjective('timber-stockpile', 'Raise building stock', 'wood', woodTarget + 4, 60),
        createTimberTaskObjective(progression),
        (canDeliverFood(progression)
          ? deliverObjective('mess-hall', 'Secure supplies', 'food', foodTarget, 45)
          : taskObjective(
              'trail-break',
              'Open the inland routes',
              'Build 1 road so hauling lines stop bogging down on open ground.',
              'buildRoad',
              1,
              45,
            )),
        reachObjective(Math.max(frontierRingTarget, 8), 60, false),
        createHarborOrWaterObjective(progression, missionScale),
      ];
      break;
    case 'prospectors_call':
      objectives = [
        surveyObjective(surveyTarget + 1, 45),
        reachObjective(Math.max(frontierRingTarget, 9), 60),
        taskObjective('mine-head', 'Establish mining', 'Build 1 mine so the expedition can start producing ore.', 'buildMine', 1, 75),
        deliverObjective('ore-haul', 'Ship the ore out', 'ore', oreTarget + 2, 60),
        (hasUnlockedTask(progression, 'buildSupplyDepot')
          ? taskObjective(
              'forward-logistics',
              'Stage the dig site',
              'Build 1 supply depot to keep ore and timber moving inland.',
              'buildSupplyDepot',
              1,
              60,
              false,
            )
          : deliverObjective('support-lumber', 'Support the dig site', 'wood', woodTarget, 45, false)),
      ];
      break;
    case 'foragers_feast':
      objectives = [
        surveyObjective(surveyTarget - 1, 45),
        deliverObjective('field-rations', 'Fill the stores', 'food', foodTarget + 2, 60),
        createFoodTaskObjective(progression),
        deliverObjective('camp-frames', 'Frame the camp', 'wood', woodTarget, 45),
        reachObjective(Math.max(frontierRingTarget, 8), 45, false),
        createHarborOrWaterObjective(progression, missionScale),
      ];
      break;
    case 'roadworks_drive': {
      const roadTarget = getRoadTaskTarget(missionScale, 3);

      objectives = [
        surveyObjective(Math.max(14, surveyTarget - 1), 45),
        taskObjective(
          'road-crew',
          'Connect the lanes',
          `Build ${roadTarget} roads so frontier traffic can move on something steadier than mud.`,
          'buildRoad',
          roadTarget,
          90,
        ),
        taskObjective(
          'waystation',
          'Raise a waystation',
          'Build 1 supply depot so crews can stage timber and rations along the route.',
          'buildSupplyDepot',
          1,
          75,
        ),
        deliverObjective('route-stock', 'Stock the crews', 'wood', woodTarget, 45, false),
        reachObjective(Math.max(frontierRingTarget, 9), 60, false),
        (hasUnlockedTask(progression, 'buildWatchtower')
          ? taskObjective(
              'lane-overlook',
              'Watch the approaches',
              'Build 1 watchtower to keep the new lanes under signal cover.',
              'buildWatchtower',
              1,
              60,
              false,
            )
          : createTimberTaskObjective(progression)),
      ];
      break;
    }
    case 'new_hearths': {
      const roadTarget = getRoadTaskTarget(Math.max(0, missionScale - 1), 2);

      objectives = [
        surveyObjective(Math.max(12, surveyTarget - 2), 45),
        createTownCenterTaskObjective(),
        taskObjective(
          'settlers-road',
          'Bind the new district',
          `Build ${roadTarget} roads so the new hearth is tied back into the colony.`,
          'buildRoad',
          roadTarget,
          90,
        ),
        (hasUnlockedTask(progression, 'buildSupplyDepot')
          ? taskObjective(
              'wagon-yard',
              'Stock the crossing',
              'Build 1 supply depot so the new town can receive materials without a long backhaul.',
              'buildSupplyDepot',
              1,
              75,
              false,
            )
          : deliverObjective('wagon-stock', 'Load the wagons', 'wood', woodTarget, 45, false)),
        (canDeliverFood(progression)
          ? deliverObjective('settlers-rations', 'Provision the new hearth', 'food', Math.max(8, foodTarget - 1), 45, false)
          : reachObjective(Math.max(frontierRingTarget, 8), 45, false)),
      ];
      break;
    }
    case 'open_frontier':
    default:
      objectives = [
        surveyObjective(surveyTarget + 2, 45),
        reachObjective(Math.max(frontierRingTarget, 6 + missionScale), 75),
        deliverObjective('frontier-lumber', 'Raise the first structures', 'wood', woodTarget + 2, 60),
        createScoutingTaskObjective(progression, missionScale),
        (canDeliverOre(progression)
          ? deliverObjective('ore-haul', 'Bring back samples', 'ore', oreTarget, 60, false)
          : createTimberTaskObjective(progression)),
      ];
      break;
  }

  return { mutatorKey: selectedMutator, objectives: injectSupportObjectives(objectives, progression.missionNumber, metrics) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateFoundingExpedition(seed: number): RunBlueprint {
  return generateFoundingExpeditionMission(seed, 1, {
    frontierDistance: 1,
    population: 1,
    activeTiles: 0,
    inactiveTiles: 0,
  });
}

export function generateFoundingExpeditionMission(
  seed: number,
  missionNumber: number,
  metrics: RunGenerationMetrics,
): RunBlueprint {
  const progression = createStoryProgression(missionNumber);

  let selectedMutator: RunMutatorKey;
  let objectives: ObjectiveBlueprint[];

  if (missionNumber <= 10) {
    // Hand-crafted tutorial missions
    selectedMutator = getTutorialMutator(missionNumber);
    objectives = injectSupportObjectives(
      getTutorialMissionObjectives(missionNumber, metrics.frontierDistance),
      missionNumber,
      metrics,
    );
  } else {
    // Procedural missions using mutator system
    const rng = createSeededRandom(seed ^ 0x9e3779b9);
    for (let i = 1; i < missionNumber; i++) {
      rng();
      rng();
      rng();
    }
    const result = generateProceduralMission(rng, progression, metrics);
    selectedMutator = result.mutatorKey;
    objectives = result.objectives;
  }

  const story = createStoryBeat(
    missionNumber,
    metrics.frontierDistance,
    {
      key: selectedMutator,
      name: MUTATORS[selectedMutator].name,
      description: MUTATORS[selectedMutator].description,
    },
  );

  return {
    mode: 'story_mode',
    modeLabel: 'Story Mode',
    mutator: {
      key: selectedMutator,
      name: MUTATORS[selectedMutator].name,
      description: MUTATORS[selectedMutator].description,
    },
    story,
    progression,
    objectives,
  };
}

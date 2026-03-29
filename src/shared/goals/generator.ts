import type { ResourceType } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { ObjectiveBlueprint, ObjectiveReward, RunBlueprint, RunMutatorKey } from './types.ts';
import { createStoryProgression, getAvailableStoryTaskKeys, type StoryProgressionSnapshot } from '../story/progression.ts';
import { createStoryBeat } from '../story/storyMode.ts';

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

function surveyObjective(target: number, rewardSeconds: number): ObjectiveBlueprint {
  return {
    id: 'survey',
    title: 'Chart the perimeter',
    description: `Discover ${target} frontier tiles.`,
    kind: 'discover_tiles',
    required: true,
    target,
    reward: scoreReward(rewardSeconds),
  };
}

function reachObjective(target: number, rewardSeconds: number, required: boolean = true): ObjectiveBlueprint {
  return {
    id: `reach-ring-${target}`,
    title: `Reach frontier ring ${target}`,
    description: `Push the colony's explored frontier out to distance ${target} from the closest town center.`,
    kind: 'reach_distance',
    required,
    target,
    reward: scoreReward(rewardSeconds),
  };
}

function deliverObjective(
  id: string,
  title: string,
  resourceType: ResourceType,
  target: number,
  rewardSeconds: number,
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
    reward: scoreReward(rewardSeconds),
  };
}

function taskObjective(
  id: string,
  title: string,
  description: string,
  taskType: TaskType,
  target: number,
  rewardSeconds: number,
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
    reward: scoreReward(rewardSeconds),
  };
}

function hasUnlockedTask(progression: StoryProgressionSnapshot, taskKey: TaskType) {
  return getAvailableStoryTaskKeys(progression).includes(taskKey);
}

function canDeliverFood(progression: StoryProgressionSnapshot) {
  return (
    hasUnlockedTask(progression, 'collectRations')
    || hasUnlockedTask(progression, 'fishAtDock')
  );
}

function canDeliverOre(progression: StoryProgressionSnapshot) {
  return hasUnlockedTask(progression, 'buildMine') && hasUnlockedTask(progression, 'mineOre');
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
      'Build 1 dock to improve shoreline access.',
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
      'Harvest 2 lily patches to prove the shoreline can support the camp.',
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
      'Build 1 granary to stabilize rations before the next charter lands.',
      'buildGranary',
      1,
      75,
    );
  }

  return taskObjective(
    'shore-forage',
    'Forage the shallows',
    'Harvest 2 lily patches to prove the shoreline can feed the camp.',
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

export function generateFoundingExpedition(seed: number): RunBlueprint {
  return generateFoundingExpeditionMission(seed, 1, 1);
}

export function generateFoundingExpeditionMission(
  seed: number,
  missionNumber: number,
  currentFrontierDistance: number,
): RunBlueprint {
  const rng = createSeededRandom(seed ^ 0x9e3779b9);
  for (let i = 1; i < missionNumber; i++) {
    rng();
    rng();
    rng();
  }
  const progression = createStoryProgression(missionNumber);
  const mutatorKeys = getAvailableMutators(progression);
  const selectedMutator = mutatorKeys[Math.floor(rng() * mutatorKeys.length)] ?? 'open_frontier';
  const missionScale = Math.max(0, missionNumber - 1);
  const surveyTarget = rollBetween(rng, 18, 24) + (missionScale * 3);
  const woodTarget = rollBetween(rng, 18, 28) + (missionScale * 4);
  const foodTarget = rollBetween(rng, 10, 18) + (missionScale * 3);
  const oreTarget = rollBetween(rng, 14, 24) + (missionScale * 4);
  const frontierRingTarget = Math.max(6 + missionScale, currentFrontierDistance + 3 + Math.floor(missionScale / 2));

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
        reachObjective(Math.max(frontierRingTarget, 10), 75),
        deliverObjective('frontier-lumber', 'Raise the first structures', 'wood', woodTarget + 2, 60),
        createScoutingTaskObjective(progression, missionScale),
        (canDeliverOre(progression)
          ? deliverObjective('ore-haul', 'Bring back samples', 'ore', oreTarget, 60, false)
          : createTimberTaskObjective(progression)),
      ];
      break;
  }

  const story = createStoryBeat(
    missionNumber,
    currentFrontierDistance,
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

import { TERRAIN_DEFS, type TerrainDef } from '../../core/terrainDefs.ts';
import type { ResourceAmount } from '../../core/types/Resource.ts';
import type { TaskDefinition } from '../../core/types/Task.ts';
import { listBuildingDefinitions, type BuildingDefinition } from '../buildings/registry.ts';
import { listResourceDefinitions, getResourceGroupDefinition } from '../game/resourceDefinitions.ts';
import { createDefaultSeasonConfig, type SeasonEndGoalConfig, type SeasonStageConfig } from '../seasons/types.ts';
import { listStudyDefinitions, type StudyDefinition, type StudyEffect } from '../studies/studies.ts';
import '../tasks/definitions/gatherTimber.ts';
import '../tasks/definitions/mineOre.ts';
import '../tasks/taskDefinitions.ts';
import { listTaskDefinitions } from '../tasks/taskRegistry.ts';
import {
  listProgressionNodeDefinitions,
  type ProgressionNodeDefinition,
  type ProgressionUnlockRef,
  type RequirementDefinition,
} from '../story/progression.ts';
import { storyModeActs, storyModeFeatures } from '../story/storyMode.ts';
import type { WikiBlock, WikiPageDefinition } from './wikiTypes.ts';

type ResourceProbe = () => ResourceAmount | ResourceAmount[] | undefined;

function titleCaseKey(key: string) {
  return key
    .replace(/[_:-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function yesNo(value: boolean | undefined) {
  return value ? 'Yes' : 'No';
}

function formatNumber(value: number | undefined) {
  if (value === undefined) return 'None';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatDuration(ms: number | undefined) {
  if (ms === undefined) return 'Not configured';
  const minutes = ms / 60_000;
  if (minutes < 1) return `${Math.round(ms / 1000)} sec`;
  if (minutes < 60) return `${formatNumber(minutes)} min`;
  return `${formatNumber(minutes / 60)} hr`;
}

function formatResources(resources: readonly ResourceAmount[] | ResourceAmount | null | undefined) {
  if (!resources) return 'None';
  const list = Array.isArray(resources) ? resources : [resources];
  if (!list.length) return 'None';
  return list
    .map((resource) => `${formatNumber(resource.amount)} ${titleCaseKey(resource.type)}`)
    .join(', ');
}

function safeResourceProbe(probe: ResourceProbe): string | null {
  try {
    return formatResources(probe());
  } catch {
    return null;
  }
}

function sortPages(pages: WikiPageDefinition[]) {
  return pages.sort((left, right) => (
    left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id)
  ));
}

function resourceRows(resources: readonly ResourceAmount[] | undefined) {
  if (!resources?.length) return [['None', '0']];
  return resources.map((resource) => [titleCaseKey(resource.type), formatNumber(resource.amount)]);
}

function buildingPlacementText(building: BuildingDefinition) {
  const flags = [
    building.requiredPopulation ? `Requires ${building.requiredPopulation} population` : null,
    building.providesWaterSource ? 'Provides water source' : null,
    building.providesWarehouse ? 'Provides warehouse storage' : null,
    building.maxIncomingRoads ? `Maximum incoming roads: ${building.maxIncomingRoads}` : null,
  ].filter((value): value is string => value !== null);

  return flags.length
    ? `${flags.join('. ')}. See in-game placement rules for terrain and adjacency checks.`
    : 'See in-game placement rules.';
}

function buildBuildingPage(building: BuildingDefinition): WikiPageDefinition {
  const cost = building.requiredResources(1);
  const blocks: WikiBlock[] = [
    { type: 'paragraph', text: building.summary },
    {
      type: 'statGrid',
      stats: [
        { label: 'Category', value: building.categoryLabel },
        { label: 'Build order', value: building.buildTaskLabel },
        { label: 'Required XP', value: formatNumber(building.requiredXp(1)), note: 'At reference distance 1.' },
        { label: 'Required population', value: building.requiredPopulation ? String(building.requiredPopulation) : 'None' },
        { label: 'Job slots', value: building.jobSlots ? String(building.jobSlots) : 'None' },
        { label: 'Variants', value: String(building.variantKeys.length) },
      ],
    },
    {
      type: 'table',
      columns: ['Cost resource', 'Amount'],
      rows: resourceRows(cost),
    },
    {
      type: 'table',
      columns: ['Work cycle', 'Resources'],
      rows: [
        ['Consumes', formatResources(building.consumes)],
        ['Produces', formatResources(building.produces)],
        ['Service consumes', formatResources(building.serviceConsumes)],
        ['Repairs', formatResources(building.repairResources)],
      ],
    },
    {
      type: 'callout',
      title: 'Placement',
      text: buildingPlacementText(building),
      tone: 'info',
    },
  ];

  if (building.getJobResources) {
    blocks.push({
      type: 'callout',
      title: 'Dynamic job output',
      text: 'This building has tile-sensitive job resources. Exact output depends on the live tile and worker count.',
      tone: 'info',
    });
  }

  return {
    id: `building:${building.key}`,
    category: 'reference',
    title: `${building.label} Building`,
    summary: building.summary,
    keywords: [
      'building',
      building.key,
      building.label,
      building.categoryLabel,
      building.buildTaskKey,
      building.buildTaskLabel,
      ...building.variantKeys,
    ],
    blocks,
    relatedPageIds: ['job-sites', 'maintenance-and-repairs'],
  };
}

export function buildBuildingReferencePages(): WikiPageDefinition[] {
  return sortPages(listBuildingDefinitions().slice().map(buildBuildingPage));
}

function taskCost(task: TaskDefinition) {
  if (!task.requiredResources) return 'None';
  if (task.requiredResources.length >= 2) return 'See in-game task rules';
  return safeResourceProbe(() => task.requiredResources?.(1)) ?? 'See in-game task rules';
}

function taskReward(task: TaskDefinition) {
  const rewards: string[] = [];
  if (task.totalRewardedResources) {
    rewards.push(
      task.totalRewardedResources.length >= 2
        ? 'Resources depend on the target tile'
        : safeResourceProbe(() => task.totalRewardedResources?.(1)) ?? 'Resources depend on the target tile',
    );
  }
  if (task.totalRewardedStats) {
    try {
      const stats = task.totalRewardedStats(1);
      const statText = Object.entries(stats)
        .map(([stat, value]) => `${formatNumber(value)} ${titleCaseKey(stat)}`)
        .join(', ');
      if (statText) rewards.push(statText);
    } catch {
      rewards.push('Stat rewards depend on the target tile');
    }
  }
  return rewards.length ? rewards.join('; ') : 'None';
}

function taskAutoChainRule(task: TaskDefinition) {
  if (task.canAutoChainTo || typeof task.chainAdjacentSameTerrain === 'function') {
    return 'Custom chain rule';
  }

  return task.chainAdjacentSameTerrain ? 'Adjacent same terrain' : 'None';
}

function buildTaskPage(task: TaskDefinition): WikiPageDefinition {
  return {
    id: `task:${task.key}`,
    category: 'reference',
    title: `${task.label} Task`,
    summary: `Reference data for the ${task.label} order.`,
    keywords: [
      'task',
      'order',
      task.key,
      task.label,
      task.repeatTask ? 'repeat' : 'single',
      task.canAutoChainTo || task.chainAdjacentSameTerrain ? 'auto chain' : 'manual',
    ],
    blocks: [
      {
        type: 'statGrid',
        stats: [
          { label: 'Task key', value: task.key },
          { label: 'Required XP', value: formatNumber(task.requiredXp(1)), note: 'At reference distance 1.' },
          { label: 'Repeat task', value: yesNo(task.repeatTask) },
          { label: 'Allows inactive tile', value: yesNo(task.allowInactiveTile) },
          { label: 'Auto-chain rule', value: taskAutoChainRule(task) },
        ],
      },
      {
        type: 'table',
        columns: ['Task economy', 'Value'],
        rows: [
          ['Required resources', taskCost(task)],
          ['Rewards', taskReward(task)],
        ],
      },
      {
        type: 'callout',
        title: 'Start rules',
        text: 'Start checks depend on live tile and hero state, so this reference does not execute canStart callbacks.',
        tone: 'info',
      },
    ],
    relatedPageIds: ['heroes-and-orders'],
  };
}

export function buildTaskReferencePages(): WikiPageDefinition[] {
  return sortPages(listTaskDefinitions().slice().map(buildTaskPage));
}

function terrainVariantCount(terrain: TerrainDef) {
  return terrain.variations?.length ?? 0;
}

function terrainDecorativeCount(terrain: TerrainDef) {
  return terrain.decorativeVariants?.length
    ?? terrain.variations?.filter((variant) => variant.decorative).length
    ?? 0;
}

export function buildTerrainReferencePages(): WikiPageDefinition[] {
  const terrainEntries = Object.entries(TERRAIN_DEFS) as [string, TerrainDef][];
  const pages = terrainEntries.map(([key, terrain]) => ({
    id: `terrain:${key}`,
    category: 'reference' as const,
    title: `${titleCaseKey(key)} Terrain`,
    summary: `Terrain reference for ${titleCaseKey(key)} tiles.`,
    keywords: ['terrain', key, titleCaseKey(key), terrain.walkable ? 'walkable' : 'blocked'],
    blocks: [
      {
        type: 'statGrid' as const,
        stats: [
          { label: 'Walkable', value: terrain.walkable === false ? 'No' : 'Yes' },
          { label: 'Move cost', value: formatNumber(terrain.moveCost ?? 1) },
          { label: 'Base weight', value: formatNumber(terrain.baseWeight) },
          { label: 'Minimum distance', value: formatNumber(terrain.minDistanceFromCenter) },
          { label: 'Connects to roads', value: yesNo(terrain.connectsToRoad) },
          { label: 'Variants', value: String(terrainVariantCount(terrain)) },
          { label: 'Decorative variants', value: String(terrainDecorativeCount(terrain)) },
        ],
      },
      {
        type: 'table' as const,
        columns: ['Adjacent terrain', 'Weight delta'],
        rows: (Object.entries(terrain.adjacency) as [string, number][])
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([adjacentTerrain, weight]) => [titleCaseKey(adjacentTerrain), formatNumber(weight)]),
      },
    ],
    relatedPageIds: ['exploration', 'movement-and-roads'],
  }));

  return sortPages(pages);
}

export function buildResourceReferencePages(): WikiPageDefinition[] {
  return sortPages(listResourceDefinitions().map((resource) => {
    const group = getResourceGroupDefinition(resource.group);
    return {
      id: `resource:${resource.type}`,
      category: 'reference' as const,
      title: `${resource.label} Resource`,
      summary: `${resource.label} belongs to ${group.label} and is categorized as ${titleCaseKey(resource.category)}.`,
      keywords: ['resource', resource.type, resource.label, resource.group, resource.category],
      blocks: [
        {
          type: 'statGrid' as const,
          stats: [
            { label: 'Group', value: group.label },
            { label: 'Category', value: titleCaseKey(resource.category) },
            { label: 'Consumable', value: yesNo(resource.isConsumable) },
            { label: 'Hunger relief', value: formatNumber(resource.hungerRelief ?? 0) },
            { label: 'Comfort gain', value: formatNumber(resource.happinessGain ?? 0) },
          ],
        },
        {
          type: 'paragraph' as const,
          text: resource.isConsumable
            ? `${resource.label} can be consumed by settlement systems when the matching need is active.`
            : `${resource.label} is stored for tasks, buildings, production chains, or virtual requirements.`,
        },
      ],
      relatedPageIds: ['storage-and-logistics', 'comfort-and-morale'],
    };
  }));
}

function formatStudyEffect(effect: StudyEffect) {
  switch (effect.kind) {
    case 'job_output_multiplier':
      return `Job output x${formatNumber(effect.multiplier)}`;
  }
}

function buildStudyPage(study: StudyDefinition): WikiPageDefinition {
  return {
    id: `study:${study.key}`,
    category: 'reference',
    title: `${study.label} Study`,
    summary: study.summary,
    keywords: ['study', study.key, study.label, ...study.unlocks.map((unlock) => unlock.label)],
    blocks: [
      { type: 'paragraph', text: study.summary },
      {
        type: 'statGrid',
        stats: [
          { label: 'Required work', value: formatDuration(study.requiredProgressMs) },
          { label: 'Unlock count', value: String(study.unlocks.length) },
          { label: 'Effect count', value: String(study.effects.length) },
        ],
      },
      {
        type: 'table',
        columns: ['Unlock', 'Kind', 'Description'],
        rows: study.unlocks.map((unlock) => [unlock.label, titleCaseKey(unlock.kind), unlock.description]),
      },
      {
        type: 'table',
        columns: ['Effect'],
        rows: study.effects.length ? study.effects.map((effect) => [formatStudyEffect(effect)]) : [['None']],
      },
    ],
    relatedPageIds: ['studies-and-upgrades'],
  };
}

export function buildStudyReferencePages(): WikiPageDefinition[] {
  return sortPages(listStudyDefinitions().map(buildStudyPage));
}

function scoreMultiplierText(stage: SeasonStageConfig) {
  const entries = Object.entries(stage.scoreMultiplier ?? {});
  if (!entries.length) return 'Default';
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, multiplier]) => `${titleCaseKey(category)} x${formatNumber(multiplier)}`)
    .join(', ');
}

function buildSeasonStagePage(stage: SeasonStageConfig): WikiPageDefinition {
  return {
    id: `season-stage:${stage.key}`,
    category: 'reference',
    title: `${titleCaseKey(stage.key)} Season Stage`,
    summary: `Season stage reference for ${titleCaseKey(stage.key)}.`,
    keywords: ['season', 'stage', stage.key, stage.borderPolicy],
    blocks: [
      {
        type: 'statGrid',
        stats: [
          { label: 'Enabled', value: yesNo(stage.enabled) },
          { label: 'Duration', value: formatDuration(stage.durationMs) },
          { label: 'Border policy', value: titleCaseKey(stage.borderPolicy) },
          { label: 'Settlement starts', value: yesNo(stage.allowSettlementStarts) },
          { label: 'New hero tasks', value: yesNo(stage.allowNewHeroTasks) },
        ],
      },
      {
        type: 'table',
        columns: ['Tuning', 'Value'],
        rows: [
          ['Score multipliers', scoreMultiplierText(stage)],
          ['Calamity chance', formatNumber(stage.gameplay?.calamityRollChance)],
          ['Ship order size', formatNumber(stage.gameplay?.shipOrderSizeMultiplier)],
          ['Task speed', formatNumber(stage.gameplay?.taskProgressSpeedMultiplier)],
        ],
      },
    ],
    relatedPageIds: ['seasons-and-scoring'],
  };
}

function buildSeasonGoalPage(goal: SeasonEndGoalConfig): WikiPageDefinition {
  return {
    id: `season-goal:${goal.id}`,
    category: 'reference',
    title: `${goal.label} Goal`,
    summary: `Season end goal reference for ${goal.label}.`,
    keywords: ['season', 'end goal', goal.id, goal.kind, goal.label],
    blocks: [
      {
        type: 'statGrid',
        stats: [
          { label: 'Enabled', value: yesNo(goal.enabled) },
          { label: 'Kind', value: titleCaseKey(goal.kind) },
          { label: 'Target', value: formatNumber(goal.target) },
          { label: 'Percent', value: goal.percent === undefined ? 'None' : `${formatNumber(goal.percent)}%` },
          { label: 'Building', value: goal.buildingKey ? titleCaseKey(goal.buildingKey) : 'None' },
          { label: 'Settlement scoped', value: yesNo(goal.settlementScoped) },
        ],
      },
      {
        type: 'flow',
        steps: goal.enabledDuring.map((stage) => `${titleCaseKey(stage)} stage`),
      },
    ],
    relatedPageIds: ['seasons-and-scoring'],
  };
}

export function buildSeasonReferencePages(): WikiPageDefinition[] {
  const config = createDefaultSeasonConfig();
  return sortPages([
    ...config.stages.map(buildSeasonStagePage),
    ...config.endGoals.map(buildSeasonGoalPage),
  ]);
}

function requirementText(requirement: RequirementDefinition): string {
  switch (requirement.kind) {
    case 'population_at_least':
      return `Population at least ${requirement.amount}`;
    case 'beds_at_least':
      return `Beds at least ${requirement.amount}`;
    case 'frontier_distance_at_least':
      return `Frontier distance at least ${requirement.amount}`;
    case 'resource_stock_at_least':
      return `${formatNumber(requirement.amount)} ${titleCaseKey(requirement.resourceType)} in stock`;
    case 'food_source_stock_at_least':
      return `${formatNumber(requirement.amount)} edible food in stock`;
    case 'building_count_at_least':
      return `${formatNumber(requirement.amount)} ${titleCaseKey(requirement.buildingKey)} built`;
    case 'building_operational_at_least':
      return `${formatNumber(requirement.amount)} ${titleCaseKey(requirement.buildingKey)} operational`;
    case 'terrain_discovered':
      return `${titleCaseKey(requirement.terrainKey)} discovered`;
    case 'landing_terrain_discovered':
      return `${titleCaseKey(requirement.terrainKey)} discovered at landing`;
    case 'study_completed':
      return `${titleCaseKey(requirement.studyKey)} study completed`;
    case 'any_study_completed':
      return 'Any study completed';
    case 'any_hero_ability_charge_earned':
      return 'Any hero ability charge earned';
    case 'any_of':
      return requirement.requirements.map(requirementText).join(' or ');
  }
}

function unlockText(unlock: ProgressionUnlockRef) {
  return `${titleCaseKey(unlock.kind)}: ${titleCaseKey(unlock.key)}`;
}

function buildProgressionNodePage(node: ProgressionNodeDefinition): WikiPageDefinition {
  return {
    id: `progression:${node.key}`,
    category: 'reference',
    title: `${node.label} Progression`,
    summary: node.description,
    keywords: ['progression', node.key, node.label, node.category, ...node.unlocks.map((unlock) => unlock.key)],
    blocks: [
      { type: 'paragraph', text: node.description },
      {
        type: 'statGrid',
        stats: [
          { label: 'Lane', value: node.category },
          { label: 'Starts unlocked', value: yesNo(node.startsUnlocked) },
          { label: 'Sort order', value: String(node.sortOrder) },
          { label: 'Unlocks', value: String(node.unlocks.length) },
        ],
      },
      {
        type: 'table',
        columns: ['Requirement'],
        rows: node.requirements.length ? node.requirements.map((requirement) => [requirementText(requirement)]) : [['None']],
      },
      {
        type: 'table',
        columns: ['Unlock'],
        rows: node.unlocks.map((unlock) => [unlockText(unlock)]),
      },
    ],
    relatedPageIds: ['studies-and-upgrades'],
  };
}

function buildStoryModePage(): WikiPageDefinition {
  return {
    id: 'story-mode',
    category: 'reference',
    title: 'Story Mode Reference',
    summary: 'Story mode features and act structure used by the progression arc.',
    keywords: ['story', 'story mode', 'chapter', 'act', ...storyModeActs.map((act) => act.title)],
    blocks: [
      {
        type: 'table',
        columns: ['Feature', 'Description'],
        rows: storyModeFeatures.map((feature) => [feature.label, feature.description]),
      },
      {
        type: 'table',
        columns: ['Act', 'Title', 'Description'],
        rows: storyModeActs.map((act) => [act.label, act.title, act.description]),
      },
    ],
    relatedPageIds: ['getting-started', 'studies-and-upgrades'],
  };
}

export function buildProgressionReferencePages(): WikiPageDefinition[] {
  return sortPages([
    ...listProgressionNodeDefinitions().map(buildProgressionNodePage),
    buildStoryModePage(),
  ]);
}

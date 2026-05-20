import { computed, ref } from 'vue';

import type { ResourceAmount } from '../core/types/Resource.ts';
import type { TaskType } from '../core/types/Task.ts';
import { TERRAIN_DEFS, type TerrainKey, type TileAnimationDef } from '../core/terrainDefs.ts';
import { getBuildingDefinitionByKey, getBuildingDefinitionByTaskKey } from '../shared/buildings/registry.ts';
import { getResourceDefinition } from '../shared/game/resourceDefinitions.ts';
import type { ProgressionSnapshot } from '../shared/story/progression.ts';
import {
  getStoryBuildingDescriptor,
  getStoryTaskDescriptor,
  type BuildingKey,
  type ProgressionUnlockKind,
} from '../shared/story/progression.ts';
import { getStudyDefinition } from '../shared/studies/studies.ts';
import '../shared/tasks/taskDefinitions.ts';
import { getTaskDefinition } from '../shared/tasks/taskRegistry.ts';

export type UnlockAnnouncementItemKind = 'building' | 'task';

export interface UnlockAnnouncementPreview {
  baseAssetKey: string | null;
  terrainOverlayAssetKey: string | null;
  buildingOverlayAssetKey: string | null;
  buildingOverlayAnimation?: TileAnimationDef | null;
  terrainOverlayOffset: { x: number; y: number };
  buildingOverlayOffset: { x: number; y: number };
}

export interface UnlockAnnouncementItem {
  kind: UnlockAnnouncementItemKind;
  key: string;
  label: string;
  summary: string;
  details: string[];
  preview?: UnlockAnnouncementPreview | null;
}

export interface UnlockAnnouncement {
  id: string;
  title: string;
  subtitle: string;
  items: UnlockAnnouncementItem[];
}

const announcementQueue = ref<UnlockAnnouncement[]>([]);

export const activeUnlockAnnouncement = computed(() => announcementQueue.value[0] ?? null);
export const unlockAnnouncementCount = computed(() => announcementQueue.value.length);

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `unlock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function unique<T extends string>(values: readonly T[]) {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function formatResourceAmount(resource: ResourceAmount) {
  return `${resource.amount} ${getResourceDefinition(resource.type).label}`;
}

function formatResourceList(resources: readonly ResourceAmount[]) {
  if (resources.length === 0) {
    return 'no resources';
  }

  if (resources.length === 1) {
    return formatResourceAmount(resources[0]!);
  }

  return `${resources.slice(0, -1).map(formatResourceAmount).join(', ')} and ${formatResourceAmount(resources[resources.length - 1]!)}`;
}

const TERRAIN_LABEL_BY_VARIANT_PREFIX: Record<string, string> = {
  plains: 'plains',
  dirt: 'dirt',
  forest: 'forest',
  water: 'water',
  mountains: 'mountain',
  mountain: 'mountain',
  snow: 'snow',
  dessert: 'desert',
  grain: 'grain field',
  hops: 'hops field',
  grapes: 'grape field',
  towncenter: 'town center',
};

function describeBuildingPlacement(variantKeys: readonly string[]) {
  const terrainLabels = unique(
    variantKeys
      .map((variantKey) => TERRAIN_LABEL_BY_VARIANT_PREFIX[variantKey.split('_')[0] ?? ''])
      .filter((label): label is string => !!label),
  );

  if (terrainLabels.length === 0) {
    return null;
  }

  return `Build it on valid ${terrainLabels.join(', ')} ${pluralize(terrainLabels.length, 'tile')}.`;
}

function describeResourceFlow(consumes: readonly ResourceAmount[] | undefined, produces: readonly ResourceAmount[] | undefined) {
  const consumeText = consumes?.length ? `uses ${formatResourceList(consumes)}` : '';
  const produceText = produces?.length ? `makes ${formatResourceList(produces)}` : '';

  if (consumeText && produceText) {
    return `${consumeText} and ${produceText}`;
  }

  return consumeText || produceText;
}

function findVariantTerrain(variantKey: string): TerrainKey | null {
  for (const [terrainKey, terrainDef] of Object.entries(TERRAIN_DEFS) as [TerrainKey, (typeof TERRAIN_DEFS)[TerrainKey]][]) {
    if (terrainDef.variations?.some((variant) => variant.key === variantKey)) {
      return terrainKey;
    }
  }

  return null;
}

function resolveBuildingPreview(buildingKey: string): UnlockAnnouncementPreview | null {
  const building = getBuildingDefinitionByKey(buildingKey);
  if (!building) {
    return null;
  }

  if (building.key === 'townCenter') {
    const terrainDef = TERRAIN_DEFS.towncenter;
    return {
      baseAssetKey: terrainDef.assetKey ?? 'towncenter',
      terrainOverlayAssetKey: terrainDef.overlayAssetKey ?? null,
      buildingOverlayAssetKey: building.overlayAssetKey ?? null,
      buildingOverlayAnimation: building.overlayAnimation ?? null,
      terrainOverlayOffset: terrainDef.overlayOffset ?? { x: 0, y: 0 },
      buildingOverlayOffset: building.overlayOffset ?? { x: 0, y: 0 },
    };
  }

  const previewVariantKey = building.variantKeys[0] ?? null;
  if (!previewVariantKey) {
    return null;
  }

  const terrainKey = findVariantTerrain(previewVariantKey);
  if (!terrainKey) {
    return null;
  }

  const terrainDef = TERRAIN_DEFS[terrainKey];
  const variantDef = terrainDef.variations?.find((variant) => variant.key === previewVariantKey) ?? null;
  const baseAssetKey = variantDef?.assetKey ?? terrainDef.assetKey ?? terrainKey;
  let terrainOverlayAssetKey = terrainDef.overlayAssetKey ?? null;

  if (variantDef?.overlayAssetKey === false) {
    terrainOverlayAssetKey = null;
  } else if (typeof variantDef?.overlayAssetKey === 'string') {
    terrainOverlayAssetKey = variantDef.overlayAssetKey;
  }

  return {
    baseAssetKey,
    terrainOverlayAssetKey,
    buildingOverlayAssetKey: building.overlayAssetKey ?? null,
    buildingOverlayAnimation: building.overlayAnimation ?? null,
    terrainOverlayOffset: variantDef?.overlayOffset ?? terrainDef.overlayOffset ?? { x: 0, y: 0 },
    buildingOverlayOffset: building.overlayOffset ?? { x: 0, y: 0 },
  };
}

function buildBuildingAnnouncementItem(buildingKey: string): UnlockAnnouncementItem | null {
  const descriptor = getStoryBuildingDescriptor(buildingKey as BuildingKey);
  const building = getBuildingDefinitionByKey(buildingKey);
  if (!building) {
    return {
      kind: 'building',
      key: buildingKey,
      label: descriptor.label,
      summary: descriptor.description,
      details: ['A new construction option is available from the task menu on valid tiles.'],
      preview: null,
    };
  }

  const details: string[] = [
    `New task: ${building.buildTaskLabel}. Select a valid tile and choose this task to start construction.`,
  ];
  const placement = describeBuildingPlacement(building.variantKeys);
  if (placement) {
    details.push(placement);
  }

  const buildCost = building.requiredResources(0);
  details.push(`Build cost: ${formatResourceList(buildCost)}. Heroes haul missing materials from storage before work continues.`);

  if (building.providesWaterSource) {
    details.push('Once built, it counts as a water source for nearby water-hauling and farming work.');
  }

  if (building.providesWarehouse) {
    details.push('Once built, it stores resources locally so nearby construction and jobs can draw from a closer stockpile.');
  }

  if (building.jobSlots && building.jobSlots > 0) {
    const flow = describeResourceFlow(building.consumes, building.produces);
    const jobLabel = building.jobLabel ?? 'worker';
    details.push(
      flow
        ? `After construction, assign up to ${building.jobSlots} ${pluralize(building.jobSlots, jobLabel)}; each work cycle ${flow}.`
        : `After construction, assign up to ${building.jobSlots} ${pluralize(building.jobSlots, jobLabel)} to run its work cycles.`,
    );
  }

  if (building.maintenanceDecayPerMinute && building.repairResources?.length) {
    details.push(`Maintenance: settlers use ${formatResourceList(building.repairResources)} to repair wear and keep it operational.`);
  }

  return {
    kind: 'building',
    key: building.key,
    label: building.label,
    summary: building.summary || descriptor.description,
    details,
    preview: resolveBuildingPreview(building.key),
  };
}

function buildTaskAnnouncementItem(taskKey: string): UnlockAnnouncementItem | null {
  const descriptor = getStoryTaskDescriptor(taskKey as TaskType);
  const task = getTaskDefinition(taskKey);
  const building = getBuildingDefinitionByTaskKey(taskKey);

  if (building) {
    return buildBuildingAnnouncementItem(building.key);
  }

  const label = descriptor?.label ?? task?.label ?? taskKey;
  const summary = descriptor?.description ?? 'A new contextual task is available on matching tiles.';
  const details: string[] = [
    'Select a matching tile and choose this task from the task menu.',
  ];

  const resources = task?.requiredResources?.(0) ?? [];
  if (resources.length > 0) {
    details.push(`Requires ${formatResourceList(resources)}. Heroes fetch missing resources from storage before the task can finish.`);
  }

  if (task?.repeatTask) {
    details.push('This task can be repeated on the same tile whenever its conditions are met.');
  }

  if (task?.chainAdjacentSameTerrain) {
    details.push('After completion, heroes can continue into nearby matching tiles when chaining is available.');
  }

  return {
    kind: 'task',
    key: taskKey,
    label,
    summary,
    details,
  };
}

function buildItemsFromUnlocks(unlocks: readonly { kind: ProgressionUnlockKind | 'buff'; key: string }[]) {
  const seen = new Set<string>();
  const items: UnlockAnnouncementItem[] = [];

  for (const unlock of unlocks) {
    const item = unlock.kind === 'building'
      ? buildBuildingAnnouncementItem(unlock.key)
      : unlock.kind === 'task'
        ? buildTaskAnnouncementItem(unlock.key)
        : null;

    if (!item) continue;

    const itemKey = `${item.kind}:${item.key}`;
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    items.push(item);
  }

  return items;
}

function findNewValues<T extends string>(previous: readonly T[], next: readonly T[]) {
  const previousSet = new Set(previous);
  return next.filter((value) => !previousSet.has(value));
}

export function buildProgressionUnlockAnnouncementItems(previous: ProgressionSnapshot | null | undefined, next: ProgressionSnapshot | null | undefined) {
  if (!previous || !next) {
    return [];
  }

  return buildItemsFromUnlocks([
    ...findNewValues(previous.buildings.available, next.buildings.available).map((key) => ({ kind: 'building' as const, key })),
    ...findNewValues(previous.tasks.available, next.tasks.available).map((key) => ({ kind: 'task' as const, key })),
  ]);
}

export function buildStudyUnlockAnnouncementItems(previousCompletedKeys: readonly string[], nextCompletedKeys: readonly string[]) {
  const newStudyKeys = findNewValues(previousCompletedKeys, nextCompletedKeys);
  if (newStudyKeys.length === 0) {
    return [];
  }

  return buildItemsFromUnlocks(
    newStudyKeys.flatMap((studyKey) => getStudyDefinition(studyKey)?.unlocks ?? []),
  );
}

export function queueUnlockAnnouncement(items: readonly UnlockAnnouncementItem[], subtitle = 'New colony options are available.') {
  if (items.length === 0) {
    return;
  }

  announcementQueue.value.push({
    id: makeId(),
    title: items.length === 1 ? 'New Unlock' : 'New Unlocks',
    subtitle,
    items: items.map((item) => ({
      ...item,
      details: item.details.slice(),
    })),
  });
}

export function dismissUnlockAnnouncement() {
  if (announcementQueue.value.length === 0) {
    return;
  }

  announcementQueue.value.shift();
}

export function resetUnlockAnnouncements() {
  announcementQueue.value = [];
}

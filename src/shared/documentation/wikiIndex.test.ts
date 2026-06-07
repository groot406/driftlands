import assert from 'node:assert/strict';
import test from 'node:test';

import { TERRAIN_DEFS } from '../../core/terrainDefs.ts';
import { listBuildingDefinitions } from '../buildings/registry.ts';
import { listResourceDefinitions } from '../game/resourceDefinitions.ts';
import '../tasks/taskDefinitions.ts';
import { listTaskDefinitions } from '../tasks/taskRegistry.ts';
import { AUTHORED_WIKI_PAGES } from './wikiPages.ts';
import { getWikiPages, searchWikiPages } from './wikiIndex.ts';
import type { WikiBlock, WikiPageDefinition } from './wikiTypes.ts';

const REQUIRED_AUTHORED_PAGE_IDS = [
  'getting-started',
  'heroes-and-orders',
  'exploration',
  'movement-and-roads',
  'settlement-support',
  'housing-and-population',
  'early-food',
  'farming-and-irrigation',
  'storage-and-logistics',
  'job-sites',
  'maintenance-and-repairs',
  'mining-and-tools',
  'studies-and-upgrades',
  'market-and-trade',
  'harbors-and-ship-orders',
  'comfort-and-morale',
  'calamities',
  'seasons-and-scoring',
  'multiplayer-and-borders',
  'harsh-frontier',
  'starter-strategies',
] as const;

test('wiki page ids are unique', () => {
  const pages = getWikiPages();
  const ids = pages.map((page) => page.id);

  assert.equal(new Set(ids).size, ids.length);
});

test('every wiki page has searchable metadata and body content', () => {
  for (const page of getWikiPages()) {
    assert.ok(page.category, `${page.id} is missing a category`);
    assert.ok(page.title.trim(), `${page.id} is missing a title`);
    assert.ok(page.summary.trim(), `${page.id} is missing a summary`);
    assert.ok(page.keywords.length > 0, `${page.id} is missing keywords`);
    assert.ok(page.blocks.length > 0, `${page.id} is missing blocks`);
  }
});

test('wiki search matches titles and keywords', () => {
  assert.ok(searchWikiPages('farming').some((page) => page.id === 'farming-and-irrigation'));
  assert.ok(searchWikiPages('roads').some((page) => page.id === 'movement-and-roads'));
  assert.ok(searchWikiPages('ship orders').some((page) => page.id === 'harbors-and-ship-orders'));
});

test('building reference pages cover every building definition', () => {
  const pageIds = new Set(getWikiPages().map((page) => page.id));

  for (const building of listBuildingDefinitions()) {
    assert.ok(pageIds.has(`building:${building.key}`), `missing building:${building.key}`);
  }
});

test('task reference pages cover every registered task definition', () => {
  const pageIds = new Set(getWikiPages().map((page) => page.id));

  for (const task of listTaskDefinitions()) {
    assert.ok(pageIds.has(`task:${task.key}`), `missing task:${task.key}`);
  }
});

test('task reference pages cover known standalone task modules', () => {
  const pageIds = new Set(getWikiPages().map((page) => page.id));

  assert.ok(pageIds.has('task:mineOre'), 'missing task:mineOre');
  assert.ok(pageIds.has('task:gatherTimber'), 'missing task:gatherTimber');
});

test('task reference pages describe tile-dependent required resources conservatively', () => {
  const repairBuildingPage = getRequiredWikiPage('task:repairBuilding');
  const rescueHeroPage = getRequiredWikiPage('task:rescueHero');

  assert.equal(getTableValue(repairBuildingPage, 'Required resources'), 'See in-game task rules');
  assert.equal(getTableValue(rescueHeroPage, 'Required resources'), 'See in-game task rules');
});

test('task reference pages describe tile-dependent resource rewards conservatively', () => {
  const chopWoodPage = getRequiredWikiPage('task:chopWood');

  assert.equal(getTableValue(chopWoodPage, 'Rewards'), 'Resources depend on the target tile');
});

test('task reference pages distinguish custom chain predicates from plain adjacency chains', () => {
  const tillLandPage = getRequiredWikiPage('task:tillLand');

  assert.equal(getStatValue(tillLandPage, 'Auto-chain rule'), 'Custom chain rule');
});

test('terrain reference pages cover every terrain definition', () => {
  const pageIds = new Set(getWikiPages().map((page) => page.id));

  for (const terrainKey of Object.keys(TERRAIN_DEFS)) {
    assert.ok(pageIds.has(`terrain:${terrainKey}`), `missing terrain:${terrainKey}`);
  }
});

test('resource reference pages cover every resource definition', () => {
  const pageIds = new Set(getWikiPages().map((page) => page.id));

  for (const resource of listResourceDefinitions()) {
    assert.ok(pageIds.has(`resource:${resource.type}`), `missing resource:${resource.type}`);
  }
});

test('authored wiki pages include all required system topics', () => {
  const authoredIds = new Set(AUTHORED_WIKI_PAGES.map((page) => page.id));

  for (const id of REQUIRED_AUTHORED_PAGE_IDS) {
    assert.ok(authoredIds.has(id), `missing authored page ${id}`);
  }
});

function getRequiredWikiPage(id: string): WikiPageDefinition {
  const page = getWikiPages().find((candidate) => candidate.id === id);
  assert.ok(page, `missing ${id}`);
  return page;
}

function getTableValue(page: WikiPageDefinition, rowLabel: string): string {
  for (const block of page.blocks) {
    if (block.type !== 'table') continue;
    const row = block.rows.find((candidate) => candidate[0] === rowLabel);
    if (row?.[1]) return row[1];
  }

  assert.fail(`${page.id} is missing table row ${rowLabel}`);
}

function getStatValue(page: WikiPageDefinition, statLabel: string): string {
  const statGrid = page.blocks.find((block): block is Extract<WikiBlock, { type: 'statGrid' }> => block.type === 'statGrid');
  const stat = statGrid?.stats.find((candidate) => candidate.label === statLabel);

  assert.ok(stat, `${page.id} is missing stat ${statLabel}`);
  return stat.value;
}

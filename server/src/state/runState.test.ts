import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../../src/shared/game/types/Hero';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { configurePathTelemetry, type PathTelemetryEvent } from '../../../src/shared/game/PathService';
import { loadHeroes } from '../../../src/shared/game/state/heroStore';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { resetResourceState } from '../../../src/shared/game/state/resourceStore';
import { ensureTileExists, loadWorld } from '../../../src/shared/game/world';
import { resetStudyState } from '../../../src/store/studyStore';
import { setIo } from '../messages/messageRouter';
import { runState } from './runState';

function createTile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
    ...overrides,
    id: overrides.id,
    q: overrides.q,
    r: overrides.r,
    biome: overrides.biome ?? 'plains',
    terrain: overrides.terrain,
    discovered: overrides.discovered ?? true,
    isBaseTile: overrides.isBaseTile ?? true,
    variant: overrides.variant ?? null,
    activationState: overrides.activationState ?? 'active',
    controlledBySettlementId: overrides.controlledBySettlementId ?? '0,0',
    ownerSettlementId: overrides.ownerSettlementId ?? '0,0',
    supportBand: overrides.supportBand ?? 'stable',
    jobSiteEnabled: overrides.jobSiteEnabled ?? null,
  };
}

function createHero(overrides: Partial<Hero> & Pick<Hero, 'id'>): Hero {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Landing Scout',
    avatar: overrides.avatar ?? 'santa',
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    stats: overrides.stats ?? { xp: 0, hp: 100, atk: 1, spd: 1 },
    facing: overrides.facing ?? 'down',
    settlementId: overrides.settlementId ?? '0,0',
  };
}

function loadLandingFixture() {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'water' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 3,
    activeTileCount: 3,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 3,
      ownedTileCount: 3,
      activeTileCount: 3,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadHeroes([createHero({ id: 'hero-1' })]);
}

function landingReachabilityEvents(events: PathTelemetryEvent[]) {
  return events.filter((event) => event.source === 'run_landing_reachability');
}

test.afterEach(() => {
  configurePathTelemetry(null);
  setIo({ emit() {} });
  runState.initialize(0);
  loadWorld([]);
  loadHeroes([]);
  resetPopulationState();
  resetResourceState();
  resetWorkforceState();
  resetStudyState();
});

test('run progress reuse cached landing reachability for non-terrain events', () => {
  const pathEvents: PathTelemetryEvent[] = [];
  setIo({ emit() {} });
  configurePathTelemetry((event) => pathEvents.push(event));
  loadLandingFixture();
  runState.initialize(42);

  runState.initializeSettlement('0,0');
  assert.ok(landingReachabilityEvents(pathEvents).length > 0, 'settlement initialization should capture landing reachability once');

  pathEvents.length = 0;
  runState.recordEvent({
    type: 'resource:delivered',
    heroId: 'hero-1',
    resourceType: 'wood',
    amount: 1,
  });

  assert.equal(landingReachabilityEvents(pathEvents).length, 0);

  pathEvents.length = 0;
  runState.recordEvent({
    type: 'tile:discovered',
    tileId: '2,0',
    q: 2,
    r: 0,
    terrain: 'water',
  });

  assert.equal(landingReachabilityEvents(pathEvents).length, 1);
});

test('run progress keeps landing reachability cached for discoveries outside the landing profile radius', () => {
  const pathEvents: PathTelemetryEvent[] = [];
  setIo({ emit() {} });
  configurePathTelemetry((event) => pathEvents.push(event));
  loadLandingFixture();
  runState.initialize(42);
  runState.initializeSettlement('0,0');
  assert.ok(landingReachabilityEvents(pathEvents).length > 0, 'settlement initialization should capture landing reachability once');

  const farTile = ensureTileExists(20, 0);
  Object.assign(farTile, {
    biome: 'plains',
    terrain: 'water',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    supportBand: 'stable',
    jobSiteEnabled: null,
  } satisfies Partial<Tile>);

  pathEvents.length = 0;
  runState.recordEvent({
    type: 'tile:discovered',
    tileId: farTile.id,
    q: farTile.q,
    r: farTile.r,
    terrain: farTile.terrain,
  });

  assert.equal(landingReachabilityEvents(pathEvents).length, 0);
});

test('run progress reuses tile metrics for population events until discovery invalidates them', () => {
  setIo({ emit() {} });
  loadLandingFixture();
  runState.initialize(42);
  runState.initializeSettlement('0,0');
  assert.equal(runState.getSnapshot()?.discoveredTiles, 2);

  const newTile = ensureTileExists(3, 0);
  Object.assign(newTile, {
    biome: 'plains',
    terrain: 'plains',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    supportBand: 'stable',
    jobSiteEnabled: null,
  } satisfies Partial<Tile>);

  runState.recordEvent({
    type: 'population:changed',
    settlementId: '0,0',
  });

  assert.equal(runState.getSnapshot()?.discoveredTiles, 2);

  runState.recordEvent({
    type: 'tile:discovered',
    tileId: newTile.id,
    q: newTile.q,
    r: newTile.r,
    terrain: newTile.terrain,
  });

  assert.equal(runState.getSnapshot()?.discoveredTiles, 3);
});

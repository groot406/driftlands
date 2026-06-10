import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { GameAnalytics } from './gameAnalytics';

function tempAnalyticsDir() {
  return mkdtempSync(join(tmpdir(), 'driftlands-analytics-'));
}

function cleanup(path: string) {
  rmSync(path, { recursive: true, force: true });
}

test('player sessions count unique players once per day and flush play time on disconnect', () => {
  const dir = tempAnalyticsDir();
  try {
    const analytics = new GameAnalytics({ analyticsPath: dir, salt: 'test-salt', now: () => 1_000 });

    analytics.recordPlayerJoin('socket-a', 'player-one', 1_000);
    analytics.recordPlayerDisconnect('socket-a', 61_000);
    analytics.recordPlayerJoin('socket-b', 'player-one', 70_000);
    analytics.recordPlayerDisconnect('socket-b', 100_000);

    const stats = analytics.getStats('today', {
      connectedSockets: 0,
      connectedPlayers: 0,
    });

    assert.equal(stats.totals.uniquePlayers, 1);
    assert.equal(stats.totals.sessionsStarted, 2);
    assert.equal(stats.totals.playMs, 90_000);
    assert.equal(stats.daily.length, 1);
    assert.equal(stats.daily[0]?.uniquePlayers, 1);
    assert.equal(JSON.stringify(stats), JSON.stringify(stats).replace(/player-one|socket-a|socket-b/g, ''));
  } finally {
    cleanup(dir);
  }
});

test('inbound messages and gameplay events map to aggregate action counters', () => {
  const dir = tempAnalyticsDir();
  try {
    const analytics = new GameAnalytics({ analyticsPath: dir, salt: 'test-salt', now: () => 1_000 });

    analytics.recordPlayerJoin('socket-a', 'player-one', 1_000);
    analytics.recordInboundMessage('socket-a', {
      type: 'task:request_start',
      task: 'chop',
    } as any);
    analytics.recordInboundMessage('socket-a', {
      type: 'market:trade',
      action: 'buy',
    } as any);
    analytics.recordGameplayEvent({
      type: 'task:completed',
      taskType: 'chop',
      tileId: '0,0',
      participantIds: ['h1'],
    });
    analytics.recordGameplayEvent({
      type: 'ship_order:completed',
      orderId: 'order-1',
      settlementId: '0,0',
      playerId: 'player-one',
      fulfilledValue: 12,
      requestedValue: 12,
    });

    const stats = analytics.getStats('today', {
      connectedSockets: 1,
      connectedPlayers: 1,
    });

    assert.equal(stats.actions.task_start_chop, 1);
    assert.equal(stats.actions.market_buy, 1);
    assert.equal(stats.actions.task_completed_chop, 1);
    assert.equal(stats.actions.ship_order_completed, 1);
  } finally {
    cleanup(dir);
  }
});

test('client panel open and close events count opens and total visible duration', () => {
  const dir = tempAnalyticsDir();
  try {
    const analytics = new GameAnalytics({ analyticsPath: dir, salt: 'test-salt', now: () => 1_000 });

    analytics.recordPlayerJoin('socket-a', 'player-one', 1_000);
    analytics.recordClientEvent('socket-a', {
      type: 'analytics:client_event',
      event: 'panel:open',
      name: 'mission-center',
      at: 2_000,
    });
    analytics.recordClientEvent('socket-a', {
      type: 'analytics:client_event',
      event: 'panel:close',
      name: 'mission-center',
      at: 7_500,
    });

    const stats = analytics.getStats('today', {
      connectedSockets: 1,
      connectedPlayers: 1,
    });

    assert.deepEqual(stats.panels['mission-center'], {
      opens: 1,
      totalOpenMs: 5_500,
    });
  } finally {
    cleanup(dir);
  }
});

test('retention pruning removes old daily files and ranges include only requested days', () => {
  const dir = tempAnalyticsDir();
  try {
    writeFileSync(join(dir, '2026-04-01.json'), JSON.stringify({
      date: '2026-04-01',
      uniquePlayerHashes: ['old'],
      sessionsStarted: 1,
      playMs: 1,
      settlementsFounded: 0,
      worldRestarts: 0,
      seasonRestarts: 0,
      actions: {},
      panels: {},
    }));

    const analytics = new GameAnalytics({
      analyticsPath: dir,
      retentionDays: 30,
      salt: 'test-salt',
      now: () => Date.UTC(2026, 5, 9, 12, 0, 0),
    });

    analytics.recordPlayerJoin('socket-a', 'player-one', Date.UTC(2026, 5, 9, 12, 0, 0));

    assert.deepEqual(readdirSync(dir).sort(), ['2026-06-09.json']);
    assert.equal(analytics.getStats('7d', { connectedSockets: 1, connectedPlayers: 1 }).daily.length, 1);
    assert.equal(analytics.getStats('30d', { connectedSockets: 1, connectedPlayers: 1 }).daily.length, 1);
  } finally {
    cleanup(dir);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { getDesktopWorldDisplayMode } from './titleScreenWorldState.ts';

test('remote world panels replace the displayed mode instead of stacking with solo', () => {
  assert.equal(
    getDesktopWorldDisplayMode('solo', { joinPanelOpen: true, sharedPanelOpen: false }),
    'lan-join',
  );
  assert.equal(
    getDesktopWorldDisplayMode('solo', { joinPanelOpen: false, sharedPanelOpen: true }),
    'shared',
  );
});

test('displayed mode falls back to the active world when no panel is focused', () => {
  assert.equal(
    getDesktopWorldDisplayMode('lan-host', { joinPanelOpen: false, sharedPanelOpen: false }),
    'lan-host',
  );
});

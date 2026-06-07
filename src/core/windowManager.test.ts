import test from 'node:test';
import assert from 'node:assert/strict';

import {
  closeWindow,
  getActiveWindow,
  openWindow,
  WINDOW_IDS,
} from './windowManager.ts';

test.afterEach(() => {
  closeWindow(WINDOW_IDS.IN_GAME_MENU);
  closeWindow(WINDOW_IDS.DEBUG_TOOLS_PANEL);
  closeWindow(WINDOW_IDS.DOCUMENTATION_MODAL);
});

test('highest priority open window is active', () => {
  openWindow(WINDOW_IDS.DOCUMENTATION_MODAL);
  assert.equal(getActiveWindow.value, WINDOW_IDS.DOCUMENTATION_MODAL);

  openWindow(WINDOW_IDS.DEBUG_TOOLS_PANEL);
  assert.equal(getActiveWindow.value, WINDOW_IDS.DEBUG_TOOLS_PANEL);

  openWindow(WINDOW_IDS.IN_GAME_MENU);
  assert.equal(getActiveWindow.value, WINDOW_IDS.IN_GAME_MENU);

  closeWindow(WINDOW_IDS.IN_GAME_MENU);
  assert.equal(getActiveWindow.value, WINDOW_IDS.DEBUG_TOOLS_PANEL);

  closeWindow(WINDOW_IDS.DEBUG_TOOLS_PANEL);
  assert.equal(getActiveWindow.value, WINDOW_IDS.DOCUMENTATION_MODAL);
});

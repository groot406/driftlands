import test from 'node:test';
import assert from 'node:assert/strict';

import { getDistinctPlayerColor, PLAYER_COLOR_PALETTE } from './player.ts';

test('distinct player colors avoid collisions across the palette', () => {
  const colors: string[] = [];

  for (let index = 0; index < PLAYER_COLOR_PALETTE.length; index++) {
    colors.push(getDistinctPlayerColor(`player-${index}`, colors));
  }

  assert.equal(new Set(colors).size, PLAYER_COLOR_PALETTE.length);
});

test('distinct player colors generate extras after the palette is full', () => {
  const colors = [...PLAYER_COLOR_PALETTE];
  const extra = getDistinctPlayerColor('overflow-player', colors);

  assert.ok(!colors.map((color) => color.toLowerCase()).includes(extra.toLowerCase()));
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { EntitySortService } from './EntitySortService';

test('entity sort orders by sortY, sortX, layer, and id', () => {
    const sorted = EntitySortService.sort([
        {
            entityId: 'b',
            kind: 'hero',
            q: 0,
            r: 1,
            worldX: 0,
            worldY: 0,
            spriteKey: 'hero_b',
            sortY: 10,
            sortX: 3,
            layer: 2,
            opacity: 1,
            scale: 1,
            shadow: null,
        },
        {
            entityId: 'a',
            kind: 'hero',
            q: 0,
            r: 1,
            worldX: 0,
            worldY: 0,
            spriteKey: 'hero_a',
            sortY: 10,
            sortX: 1,
            layer: 1,
            opacity: 1,
            scale: 1,
            shadow: null,
        },
        {
            entityId: 'c',
            kind: 'hero',
            q: 0,
            r: 0,
            worldX: 0,
            worldY: 0,
            spriteKey: 'hero_c',
            sortY: 2,
            sortX: 9,
            layer: 1,
            opacity: 1,
            scale: 1,
            shadow: null,
        },
    ]);

    assert.deepEqual(sorted.map((item) => item.entityId), ['c', 'a', 'b']);
});

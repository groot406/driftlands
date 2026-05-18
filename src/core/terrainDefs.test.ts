import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TERRAIN_DEFS } from './terrainDefs.ts';

function getVariantAssetKey(terrain: 'plains' | 'dirt', variantKey: string) {
    const variant = TERRAIN_DEFS[terrain].variations?.find((candidate) => candidate.key === variantKey);

    assert.ok(variant, `${variantKey} should exist`);
    return variant.assetKey;
}

test('house upgrade variants use distinct graphics assets', () => {
    assert.equal(getVariantAssetKey('plains', 'plains_house'), 'house_wood');
    assert.equal(getVariantAssetKey('plains', 'plains_stone_house'), 'house_stone');
    assert.equal(getVariantAssetKey('plains', 'plains_glass_house'), 'house_glass');

    assert.equal(getVariantAssetKey('dirt', 'dirt_house'), 'house_wood');
    assert.equal(getVariantAssetKey('dirt', 'dirt_stone_house'), 'house_stone');
    assert.equal(getVariantAssetKey('dirt', 'dirt_glass_house'), 'house_glass');
});

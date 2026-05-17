import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLooperSpriteCdnUrl,
  buildLooperSpriteFallbackUrl,
  buildLooperSpriteSpacesUrl,
  buildLooperSpriteUrl,
  buildLooperlandsPlayerId,
  toLooperHeroSelection,
} from './looperlands.ts';

test('buildLooperSpriteCdnUrl maps token ids to the Looperlands jsDelivr sheet path', () => {
  assert.equal(
    buildLooperSpriteCdnUrl('0xabc123'),
    'https://cdn.jsdelivr.net/gh/balkshamster/looperlands@main/client/img/1/NFT_abc123.png',
  );
});

test('buildLooperSpriteSpacesUrl maps token hashes to Spaces spritesheets', () => {
  assert.equal(
    buildLooperSpriteSpacesUrl('hash-1'),
    'https://looperlands.sfo3.cdn.digitaloceanspaces.com/assets/looper/1/hash-1.png',
  );
  assert.equal(buildLooperSpriteSpacesUrl(null), null);
});

test('buildLooperSpriteUrl prefers Spaces when tokenHash is available', () => {
  assert.equal(
    buildLooperSpriteUrl({ tokenId: '0xabc123', tokenHash: 'hash-1' }),
    'https://looperlands.sfo3.cdn.digitaloceanspaces.com/assets/looper/1/hash-1.png',
  );
  assert.equal(
    buildLooperSpriteFallbackUrl({ tokenId: '0xabc123', tokenHash: 'hash-1' }),
    'https://cdn.jsdelivr.net/gh/balkshamster/looperlands@main/client/img/1/NFT_abc123.png',
  );
});

test('buildLooperlandsPlayerId normalizes wallet addresses', () => {
  assert.equal(
    buildLooperlandsPlayerId('0xABCDEF0000000000000000000000000000000000', 1),
    'wallet:1:0xabcdef0000000000000000000000000000000000',
  );
});

test('toLooperHeroSelection keeps only the hero fields Driftlands needs', () => {
  assert.deepEqual(toLooperHeroSelection({
    id: 'asset-1',
    nftId: 'nft-1',
    name: 'Ada',
    assetType: 'looper',
    token: {
      tokenId: '0x123',
      tokenHash: 'hash-123',
    },
  }), {
    id: 'asset-1',
    nftId: 'nft-1',
    name: 'Ada',
    tokenId: '0x123',
    tokenHash: 'hash-123',
    spriteUrl: 'https://looperlands.sfo3.cdn.digitaloceanspaces.com/assets/looper/1/hash-123.png',
    fallbackSpriteUrl: 'https://cdn.jsdelivr.net/gh/balkshamster/looperlands@main/client/img/1/NFT_123.png',
  });
});

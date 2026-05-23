import test from 'node:test';
import assert from 'node:assert/strict';
import { isLooperlandsAuthRequired, validateLooperlandsJoin } from './looperlandsAuth.ts';
import type { LooperlandsJoinAuth } from '../../../src/shared/looperlands.ts';

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.LOOPERLANDS_API_URL;
const originalViteApiUrl = process.env.VITE_LOOPERLANDS_API_URL;
const originalRequireAuth = process.env.SERVER_REQUIRE_LOOPERLANDS_AUTH;

function auth(overrides: Partial<LooperlandsJoinAuth> = {}): LooperlandsJoinAuth {
  return {
    walletAddress: '0xABCDEF0000000000000000000000000000000000',
    chainId: 1,
    token: 'jwt',
    heroes: [
      {
        id: 'asset-1',
        nftId: 'nft-1',
        name: 'Ada',
        tokenId: '0x123',
        tokenHash: 'hash-123',
        spriteUrl: 'primary-1',
        fallbackSpriteUrl: 'fallback-1',
      },
      {
        id: 'asset-2',
        nftId: 'nft-2',
        name: 'Grace',
        tokenId: '0x456',
        tokenHash: 'hash-456',
        spriteUrl: 'primary-2',
        fallbackSpriteUrl: 'fallback-2',
      },
    ],
    ...overrides,
  };
}

test.beforeEach(() => {
  process.env.LOOPERLANDS_API_URL = 'https://looperlands-platform.test';
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) {
    delete process.env.LOOPERLANDS_API_URL;
  } else {
    process.env.LOOPERLANDS_API_URL = originalApiUrl;
  }

  if (originalViteApiUrl === undefined) {
    delete process.env.VITE_LOOPERLANDS_API_URL;
  } else {
    process.env.VITE_LOOPERLANDS_API_URL = originalViteApiUrl;
  }

  if (originalRequireAuth === undefined) {
    delete process.env.SERVER_REQUIRE_LOOPERLANDS_AUTH;
  } else {
    process.env.SERVER_REQUIRE_LOOPERLANDS_AUTH = originalRequireAuth;
  }
});

test('isLooperlandsAuthRequired follows SERVER_REQUIRE_LOOPERLANDS_AUTH', () => {
  process.env.SERVER_REQUIRE_LOOPERLANDS_AUTH = '0';
  assert.equal(isLooperlandsAuthRequired(), false);

  process.env.SERVER_REQUIRE_LOOPERLANDS_AUTH = '1';
  assert.equal(isLooperlandsAuthRequired(), true);
});

test('validateLooperlandsJoin accepts exactly two owned loopers', async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://looperlands-platform.test/api/game/wallet/0xabcdef0000000000000000000000000000000000/loopers');
    assert.equal((init?.headers as Record<string, string>)['X-AUTH-WEB3TOKEN'], 'jwt');
    return new Response(JSON.stringify({
      loopers: [
        { id: 'asset-1', nftId: 'nft-1', name: 'Ada', assetType: 'looper', token: { tokenId: '0x123', tokenHash: 'hash-123' } },
        { id: 'asset-2', nftId: 'nft-2', name: 'Grace', assetType: 'looper', token: { tokenId: '0x456', tokenHash: 'hash-456' } },
      ],
    }), { status: 200 });
  };

  const validated = await validateLooperlandsJoin(auth());

  assert.equal(validated.playerId, 'wallet:1:0xabcdef0000000000000000000000000000000000');
  assert.deepEqual(validated.heroes.map((hero) => hero.name), ['Ada', 'Grace']);
});

test('validateLooperlandsJoin accepts API URLs that already include /api', async () => {
  process.env.LOOPERLANDS_API_URL = 'https://api.looperlands.io/api';

  globalThis.fetch = async (input) => {
    assert.equal(String(input), 'https://api.looperlands.io/api/game/wallet/0xabcdef0000000000000000000000000000000000/loopers');
    return new Response(JSON.stringify({
      loopers: [
        { id: 'asset-1', nftId: 'nft-1', name: 'Ada', assetType: 'looper', token: { tokenId: '0x123', tokenHash: 'hash-123' } },
        { id: 'asset-2', nftId: 'nft-2', name: 'Grace', assetType: 'looper', token: { tokenId: '0x456', tokenHash: 'hash-456' } },
      ],
    }), { status: 200 });
  };

  const validated = await validateLooperlandsJoin(auth());

  assert.deepEqual(validated.heroes.map((hero) => hero.name), ['Ada', 'Grace']);
});

test('validateLooperlandsJoin rejects unowned loopers', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    loopers: [
      { id: 'asset-1', nftId: 'nft-1', name: 'Ada', assetType: 'looper', token: { tokenId: '0x123', tokenHash: 'hash-123' } },
    ],
  }), { status: 200 });

  await assert.rejects(
    validateLooperlandsJoin(auth()),
    /not owned/,
  );
});

test('validateLooperlandsJoin can validate wallet identity without starter hero selection', async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://looperlands-platform.test/api/game/wallet/0xabcdef0000000000000000000000000000000000/loopers');
    assert.equal((init?.headers as Record<string, string>)['X-AUTH-WEB3TOKEN'], 'jwt');
    return new Response(JSON.stringify({
      loopers: [
        { id: 'asset-1', nftId: 'nft-1', name: 'Ada', assetType: 'looper', token: { tokenId: '0x123', tokenHash: 'hash-123' } },
      ],
    }), { status: 200 });
  };

  const validated = await validateLooperlandsJoin(auth({ heroes: [] }), { requireHeroSelection: false });

  assert.equal(validated.playerId, 'wallet:1:0xabcdef0000000000000000000000000000000000');
  assert.deepEqual(validated.heroes, []);
});

test('validateLooperlandsJoin defaults to production Looperlands API URL when env is not configured', async () => {
  delete process.env.LOOPERLANDS_API_URL;
  delete process.env.VITE_LOOPERLANDS_API_URL;

  globalThis.fetch = async (input) => {
    assert.equal(String(input), 'https://api.looperlands.io/api/game/wallet/0xabcdef0000000000000000000000000000000000/loopers');
    return new Response(JSON.stringify({
      loopers: [
        { id: 'asset-1', nftId: 'nft-1', name: 'Ada', assetType: 'looper', token: { tokenId: '0x123', tokenHash: 'hash-123' } },
        { id: 'asset-2', nftId: 'nft-2', name: 'Grace', assetType: 'looper', token: { tokenId: '0x456', tokenHash: 'hash-456' } },
      ],
    }), { status: 200 });
  };

  const validated = await validateLooperlandsJoin(auth());

  assert.equal(validated.walletAddress, '0xabcdef0000000000000000000000000000000000');
});

test('validateLooperlandsJoin requires exactly two selected loopers', async () => {
  await assert.rejects(
    validateLooperlandsJoin(auth({ heroes: [auth().heroes[0]!] })),
    /exactly two/,
  );
});

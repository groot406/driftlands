import type { LooperlandsAsset, LooperlandsHeroSelection, LooperlandsJoinAuth } from '../../../src/shared/looperlands';
import {
  buildLooperlandsPlayerId,
  isLooperAsset,
  normalizeWalletAddress,
  toLooperHeroSelection,
} from '../../../src/shared/looperlands';

export interface ValidatedLooperlandsJoin {
  playerId: string;
  playerName: string;
  walletAddress: string;
  chainId: number;
  heroes: LooperlandsHeroSelection[];
}

interface ValidateLooperlandsJoinOptions {
  requireHeroSelection?: boolean;
}

const DEFAULT_LOOPERLANDS_API_URL = 'https://api.looperlands.io/api';

export function getLooperlandsApiUrl(): string {
  const apiUrl = (process.env.LOOPERLANDS_API_URL || process.env.VITE_LOOPERLANDS_API_URL || DEFAULT_LOOPERLANDS_API_URL).replace(/\/$/, '');
  return apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
}

export function getLooperlandsWeb3Url(): string {
  return getLooperlandsApiUrl().replace(/\/api$/, '');
}

export function isLooperlandsAuthRequired(): boolean {
  return process.env.SERVER_REQUIRE_LOOPERLANDS_AUTH === '1' || !!getLooperlandsApiUrl();
}

function assertWalletShape(auth: LooperlandsJoinAuth): void {
  if (!auth.walletAddress || !Number.isFinite(auth.chainId) || !auth.token) {
    throw new Error('Wallet authentication is incomplete.');
  }
}

function assertSelectionShape(auth: LooperlandsJoinAuth): void {
  assertWalletShape(auth);

  if (!Array.isArray(auth.heroes) || auth.heroes.length !== 2) {
    throw new Error('Choose exactly two Looper avatars.');
  }

  const ids = new Set(auth.heroes.map((hero) => hero.id));
  const nftIds = new Set(auth.heroes.map((hero) => hero.nftId));
  if (ids.size !== 2 || nftIds.size !== 2) {
    throw new Error('Choose two different Looper avatars.');
  }
}

async function fetchWalletLoopers(auth: LooperlandsJoinAuth): Promise<LooperlandsAsset[]> {
  const looperlandsApiUrl = getLooperlandsApiUrl();
  if (!looperlandsApiUrl) {
    throw new Error('Looperlands API URL is not configured on the Driftlands server.');
  }

  const wallet = encodeURIComponent(normalizeWalletAddress(auth.walletAddress));
  const response = await fetch(`${looperlandsApiUrl}/game/wallet/${wallet}/loopers`, {
    headers: {
      'Accept': 'application/json',
      'X-AUTH-WEB3TOKEN': auth.token,
    },
  });

  if (!response.ok) {
    throw new Error(`Looperlands wallet validation failed (${response.status}).`);
  }

  const body = await response.json() as { loopers?: LooperlandsAsset[] };
  return (body.loopers ?? []).filter(isLooperAsset);
}

export async function validateLooperlandsJoin(
  auth: LooperlandsJoinAuth,
  options: ValidateLooperlandsJoinOptions = {},
): Promise<ValidatedLooperlandsJoin> {
  const requireHeroSelection = options.requireHeroSelection ?? true;
  if (requireHeroSelection) {
    assertSelectionShape(auth);
  } else {
    assertWalletShape(auth);
  }

  const walletLoopers = await fetchWalletLoopers(auth);
  const selectedHeroes = requireHeroSelection ? auth.heroes : [];
  const loopersById = new Map(walletLoopers.map((asset) => [asset.id, asset]));
  const loopersByNftId = new Map(walletLoopers.map((asset) => [asset.nftId, asset]));
  const validatedHeroes = selectedHeroes.map((selection) => {
    const asset = loopersById.get(selection.id) ?? loopersByNftId.get(selection.nftId);
    if (!asset) {
      throw new Error('Selected Looper avatar is not owned by this wallet.');
    }

    return toLooperHeroSelection(asset);
  });

  return {
    playerId: buildLooperlandsPlayerId(auth.walletAddress, auth.chainId),
    playerName: validatedHeroes.map((hero) => hero.name).join(' & ').slice(0, 24),
    walletAddress: normalizeWalletAddress(auth.walletAddress),
    chainId: auth.chainId,
    heroes: validatedHeroes,
  };
}

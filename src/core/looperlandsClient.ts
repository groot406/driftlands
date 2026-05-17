import type { LooperlandsAsset, LooperlandsHeroSelection, LooperlandsJoinAuth } from '../shared/looperlands.ts';
import {
  buildLooperlandsPlayerId,
  isLooperAsset,
  normalizeWalletAddress,
  toLooperHeroSelection,
} from '../shared/looperlands.ts';

const TOKEN_STORAGE_KEY = 'driftlands-looperlands-token-v1';
const WALLET_STORAGE_KEY = 'driftlands-looperlands-wallet-v1';
const DEFAULT_LOOPERLANDS_API_URL = 'https://api.looperlands.io/api';
const DRIFTLANDS_LOOPERLANDS_PROXY_PATH = '/api/looperlands';
const DRIFTLANDS_API_PATH = '/api/driftlands';

export interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
}

declare global {
  interface Window {
    ethereum?: Record<string, unknown>;
  }
}

export interface LooperlandsWalletSession {
  walletAddress: string;
  chainId: number;
  token: string;
  apiUrl: string;
}

export function getLooperlandsApiUrl(): string {
  const apiUrl = (import.meta.env.VITE_LOOPERLANDS_API_URL || import.meta.env.VITE_API_URL || DEFAULT_LOOPERLANDS_API_URL).replace(/\/$/, '');
  return apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
}

function getDriftlandsLooperlandsProxyUrl(path: string): string {
  const serverUrl = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
  return `${serverUrl}${DRIFTLANDS_LOOPERLANDS_PROXY_PATH}${path}`;
}

function getDriftlandsApiUrl(path: string): string {
  const serverUrl = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
  return `${serverUrl}${DRIFTLANDS_API_PATH}${path}`;
}

export function getStoredLooperlandsSession(): LooperlandsWalletSession | null {
  try {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const rawWallet = window.localStorage.getItem(WALLET_STORAGE_KEY);
    if (!token || !rawWallet) {
      return null;
    }

    const wallet = JSON.parse(rawWallet) as { walletAddress?: string; chainId?: number; apiUrl?: string };
    if (!wallet.walletAddress || !Number.isFinite(wallet.chainId) || wallet.apiUrl !== getLooperlandsApiUrl()) {
      clearStoredLooperlandsSession();
      return null;
    }

    return {
      walletAddress: wallet.walletAddress,
      chainId: wallet.chainId!,
      token,
      apiUrl: wallet.apiUrl,
    };
  } catch {
    return null;
  }
}

export function clearStoredLooperlandsSession(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(WALLET_STORAGE_KEY);
}

function storeSession(session: LooperlandsWalletSession): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
  window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({
    walletAddress: session.walletAddress,
    chainId: session.chainId,
    apiUrl: session.apiUrl,
  }));
}

function buildSiweMessage(address: string, chainId: number, nonce: string): string {
  return [
    `${window.location.host} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in With Ethereum.',
    '',
    `URI: ${window.location.origin}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
}

function toNumberChainId(chainId: string | number): number {
  if (typeof chainId === 'number') {
    return chainId;
  }

  return Number.parseInt(chainId, chainId.startsWith('0x') ? 16 : 10);
}

function isEthereumProvider(provider: unknown): provider is EthereumProvider {
  return !!provider && typeof (provider as { request?: unknown }).request === 'function';
}

function getInjectedEthereumProvider(): EthereumProvider | undefined {
  return isEthereumProvider(window.ethereum) ? window.ethereum : undefined;
}

export async function connectLooperlandsWallet(providerOverride?: EthereumProvider): Promise<LooperlandsWalletSession> {
  const provider = providerOverride ?? getInjectedEthereumProvider();
  if (!provider) {
    throw new Error('No Ethereum wallet was found in this browser.');
  }

  const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
  const walletAddress = accounts[0];
  if (!walletAddress) {
    throw new Error('No wallet account was selected.');
  }

  const chainId = toNumberChainId(await provider.request<string>({ method: 'eth_chainId' }));
  const nonceResponse = await fetch(getDriftlandsLooperlandsProxyUrl('/web3/nonce'));
  if (!nonceResponse.ok) {
    throw new Error('Could not get a Looperlands sign-in nonce.');
  }

  const nonceBody = await nonceResponse.json() as { nonce?: string };
  if (!nonceBody.nonce) {
    throw new Error('Looperlands did not return a sign-in nonce.');
  }

  const message = buildSiweMessage(walletAddress, chainId, nonceBody.nonce);
  const signature = await provider.request<string>({
    method: 'personal_sign',
    params: [message, walletAddress],
  });

  const verifyResponse = await fetch(getDriftlandsLooperlandsProxyUrl('/web3/verify'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      signature,
      network: chainId,
      hash: '0x',
    }),
  });

  if (!verifyResponse.ok) {
    throw new Error('Looperlands wallet signature could not be verified.');
  }

  const verifyBody = await verifyResponse.json() as { token?: string };
  if (!verifyBody.token) {
    throw new Error('Looperlands did not return an auth token.');
  }

  const session = {
    walletAddress: normalizeWalletAddress(walletAddress),
    chainId,
    token: verifyBody.token,
    apiUrl: getLooperlandsApiUrl(),
  };
  storeSession(session);
  return session;
}

export async function fetchLooperlandsLoopers(session: LooperlandsWalletSession): Promise<LooperlandsHeroSelection[]> {
  const response = await fetch(getDriftlandsLooperlandsProxyUrl(`/game/wallet/${encodeURIComponent(session.walletAddress)}/loopers`), {
    headers: {
      'Accept': 'application/json',
      'X-AUTH-WEB3TOKEN': session.token,
    },
  });

  if (!response.ok) {
    if ([401, 403, 500].includes(response.status)) {
      clearStoredLooperlandsSession();
    }

    throw new Error('Could not load Looper avatars for this wallet. Reconnect your wallet and try again.');
  }

  const body = await response.json() as { loopers?: LooperlandsAsset[] };
  return (body.loopers ?? []).filter(isLooperAsset).map(toLooperHeroSelection);
}

export function buildLooperlandsJoinAuth(
  session: LooperlandsWalletSession,
  heroes: LooperlandsHeroSelection[],
): LooperlandsJoinAuth {
  return {
    walletAddress: session.walletAddress,
    chainId: session.chainId,
    token: session.token,
    heroes,
  };
}

export function buildLooperlandsContinueAuth(session: LooperlandsWalletSession): LooperlandsJoinAuth {
  return {
    walletAddress: session.walletAddress,
    chainId: session.chainId,
    token: session.token,
    heroes: [],
  };
}

export function getLooperlandsPlayerId(session: LooperlandsWalletSession): string {
  return buildLooperlandsPlayerId(session.walletAddress, session.chainId);
}

export async function fetchDriftlandsWalletSettlement(session: LooperlandsWalletSession): Promise<string | null> {
  const playerId = getLooperlandsPlayerId(session);
  const response = await fetch(getDriftlandsApiUrl(`/player/${encodeURIComponent(playerId)}/settlement`), {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Could not check existing Driftlands colony for this wallet.');
  }

  const body = await response.json() as { settlementId?: string | null };
  return body.settlementId ?? null;
}

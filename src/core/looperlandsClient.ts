import type { LooperlandsAsset, LooperlandsHeroSelection, LooperlandsJoinAuth } from '../shared/looperlands.ts';
import { hashMessage } from 'ethers';
import {
  buildLooperlandsPlayerId,
  isLooperAsset,
  normalizeWalletAddress,
  toLooperHeroSelection,
} from '../shared/looperlands.ts';
import { getDriftlandsServerUrl } from './driftlandsServerUrl.ts';
import { describeWalletError, maskDebugValue, walletLog, walletWarn } from './walletDebug.ts';

const TOKEN_STORAGE_KEY = 'driftlands-looperlands-token-v1';
const WALLET_STORAGE_KEY = 'driftlands-looperlands-wallet-v1';
const PLATFORM_TOKEN_STORAGE_KEY = 'token';
const DEFAULT_LOOPERLANDS_API_URL = 'https://api.looperlands.io/api';
const DRIFTLANDS_LOOPERLANDS_PROXY_PATH = '/api/looperlands';
const DRIFTLANDS_API_PATH = '/api/driftlands';
const DRIFTLANDS_WALLET_SETTLEMENT_TIMEOUT_MS = 4500;

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

export interface LooperlandsWalletIdentity {
  walletAddress: string;
  chainId: number;
}

function isEnabled(value: string | boolean | undefined): boolean {
  return value === true || value === '1' || value === 'true';
}

export function getLooperlandsApiUrl(): string {
  const apiUrl = (
    import.meta.env.VITE_DRIFTLANDS_LOOPERLANDS_API_URL
    || import.meta.env.VITE_LOOPERLANDS_API_URL
    || DEFAULT_LOOPERLANDS_API_URL
  ).replace(/\/$/, '');
  return apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
}

function getLooperlandsPlatformApiUrl(): string {
  return (
    import.meta.env.VITE_DRIFTLANDS_PLATFORM_API_URL
    || import.meta.env.VITE_API_URL
    || ''
  ).replace(/\/$/, '');
}

function getDriftlandsLooperlandsProxyUrl(path: string): string {
  return `${getDriftlandsServerUrl()}${DRIFTLANDS_LOOPERLANDS_PROXY_PATH}${path}`;
}

function getDriftlandsApiUrl(path: string): string {
  return `${getDriftlandsServerUrl()}${DRIFTLANDS_API_PATH}${path}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
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

function getPlatformAuthToken(): string {
  try {
    return window.localStorage.getItem(PLATFORM_TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return window.atob(padded);
}

function getStringField(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function getNumberLikeField(source: Record<string, unknown>, keys: string[]): string | number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
  }

  return undefined;
}

function isLikelyEthereumAddress(value: string | undefined): value is string {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function readPlatformSessionFromToken(token: string): LooperlandsWalletSession | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    const tokenBody = JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
    const nestedUser = tokenBody.userdata && typeof tokenBody.userdata === 'object'
      ? tokenBody.userdata as Record<string, unknown>
      : {};
    const walletAddress = getStringField(tokenBody, ['address', 'walletAddress', 'wallet'])
      ?? getStringField(nestedUser, ['address', 'walletAddress', 'wallet']);
    const chainId = getNumberLikeField(tokenBody, ['chainId', 'network'])
      ?? getNumberLikeField(nestedUser, ['chainId', 'network']);

    walletLog('platform token inspected', {
      hasWalletAddress: isLikelyEthereumAddress(walletAddress),
      hasChainId: chainId !== undefined,
    });

    if (!isLikelyEthereumAddress(walletAddress) || chainId === undefined) {
      return null;
    }

    return {
      walletAddress: normalizeWalletAddress(walletAddress),
      chainId: toNumberChainId(chainId),
      token,
      apiUrl: getLooperlandsApiUrl(),
    };
  } catch (error) {
    walletWarn('platform token inspect failed', { error: describeWalletError(error) });
    return null;
  }
}

export function hasLooperlandsPlatformSessionCandidate(): boolean {
  return isEnabled(import.meta.env.VITE_DRIFTLANDS_REUSE_PLATFORM_SESSION)
    && getPlatformAuthToken().length > 0
    && getLooperlandsPlatformApiUrl().length > 0;
}

export async function restoreLooperlandsPlatformSession(): Promise<LooperlandsWalletSession | null> {
  if (!isEnabled(import.meta.env.VITE_DRIFTLANDS_REUSE_PLATFORM_SESSION)) {
    walletLog('platform session restore skipped', { reason: 'disabled' });
    return null;
  }

  const token = getPlatformAuthToken();
  const platformApiUrl = getLooperlandsPlatformApiUrl();
  walletLog('platform session restore start', {
    hasPlatformToken: token.length > 0,
    platformApiUrl: platformApiUrl || '(missing)',
  });

  if (!token || !platformApiUrl) {
    walletWarn('platform session restore skipped', {
      reason: !token ? 'missing platform token' : 'missing platform api url',
      hasPlatformToken: token.length > 0,
      platformApiUrl: platformApiUrl || '(missing)',
    });
    return null;
  }

  const sessionUrl = `${platformApiUrl}/web3/session`;
  walletLog('platform session request', { url: sessionUrl });
  let response: Response;
  try {
    response = await fetch(sessionUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-AUTH-WEB3TOKEN': token,
      },
    });
  } catch (error) {
    walletWarn('platform session request failed', {
      url: sessionUrl,
      error: describeWalletError(error),
    });
    return null;
  }
  walletLog('platform session response', { status: response.status, ok: response.ok });

  if (!response.ok) {
    const tokenSession = readPlatformSessionFromToken(token);
    if (tokenSession) {
      storeSession(tokenSession);
      walletLog('platform session restored from token fallback', {
        walletAddress: maskDebugValue(tokenSession.walletAddress),
        chainId: tokenSession.chainId,
        hasToken: tokenSession.token.length > 0,
      });
    }
    return tokenSession;
  }

  const body = await response.json() as {
    address?: string;
    walletAddress?: string;
    chainId?: number | string;
    network?: number | string;
  };
  const walletAddress = body.address ?? body.walletAddress;
  const chainId = body.chainId ?? body.network;

  if (!walletAddress || chainId === undefined || chainId === null) {
    walletWarn('platform session restore invalid response', {
      hasAddress: !!walletAddress,
      hasChainId: chainId !== undefined && chainId !== null,
    });
    return null;
  }

  const session = {
    walletAddress: normalizeWalletAddress(walletAddress),
    chainId: toNumberChainId(chainId),
    token,
    apiUrl: getLooperlandsApiUrl(),
  };
  storeSession(session);
  walletLog('platform session restore success', {
    walletAddress: maskDebugValue(session.walletAddress),
    chainId: session.chainId,
    hasToken: session.token.length > 0,
  });
  return session;
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

export async function getAuthorizedLooperlandsWalletIdentity(providerOverride?: EthereumProvider): Promise<LooperlandsWalletIdentity | null> {
  const provider = providerOverride ?? getInjectedEthereumProvider();
  if (!provider) {
    return null;
  }

  let accounts: string[] = [];
  try {
    walletLog('provider request', { method: 'eth_accounts' });
    accounts = await provider.request<string[]>({ method: 'eth_accounts' });
    walletLog('provider response', {
      method: 'eth_accounts',
      accountCount: accounts.length,
      firstAccount: maskDebugValue(accounts[0]),
    });
  } catch (error) {
    walletWarn('provider request failed', {
      method: 'eth_accounts',
      error: describeWalletError(error),
    });
    return null;
  }

  const walletAddress = accounts[0];
  if (!walletAddress) {
    return null;
  }

  try {
    walletLog('provider request', { method: 'eth_chainId' });
    const chainId = toNumberChainId(await provider.request<string>({ method: 'eth_chainId' }));
    walletLog('provider response', { method: 'eth_chainId', chainId });
    return {
      walletAddress: normalizeWalletAddress(walletAddress),
      chainId,
    };
  } catch (error) {
    walletWarn('provider request failed', {
      method: 'eth_chainId',
      error: describeWalletError(error),
    });
    return null;
  }
}

export async function connectLooperlandsWallet(providerOverride?: EthereumProvider): Promise<LooperlandsWalletSession> {
  const provider = providerOverride ?? getInjectedEthereumProvider();
  walletLog('looperlands connect start', {
    hasProviderOverride: !!providerOverride,
    hasInjectedProvider: !!getInjectedEthereumProvider(),
    providerSource: providerOverride ? 'appkit' : 'window.ethereum',
    driftlandsServerUrl: getDriftlandsServerUrl() || '(same-origin)',
    looperlandsApiUrl: getLooperlandsApiUrl(),
  });

  if (!provider) {
    walletWarn('looperlands connect missing provider');
    throw new Error('No Ethereum wallet was found in this browser.');
  }

  let accounts: string[];
  try {
    walletLog('provider request', { method: 'eth_requestAccounts' });
    accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
    walletLog('provider response', {
      method: 'eth_requestAccounts',
      accountCount: accounts.length,
      firstAccount: maskDebugValue(accounts[0]),
    });
  } catch (error) {
    walletWarn('provider request failed', {
      method: 'eth_requestAccounts',
      error: describeWalletError(error),
    });
    throw error;
  }

  const walletAddress = accounts[0];
  if (!walletAddress) {
    throw new Error('No wallet account was selected.');
  }

  let chainId: number;
  try {
    walletLog('provider request', { method: 'eth_chainId' });
    chainId = toNumberChainId(await provider.request<string>({ method: 'eth_chainId' }));
    walletLog('provider response', { method: 'eth_chainId', chainId });
  } catch (error) {
    walletWarn('provider request failed', {
      method: 'eth_chainId',
      error: describeWalletError(error),
    });
    throw error;
  }

  const nonceUrl = getDriftlandsLooperlandsProxyUrl('/web3/nonce');
  walletLog('proxy request', { step: 'nonce', url: nonceUrl });
  const nonceResponse = await fetch(nonceUrl);
  walletLog('proxy response', { step: 'nonce', status: nonceResponse.status, ok: nonceResponse.ok });
  if (!nonceResponse.ok) {
    throw new Error('Could not get a Looperlands sign-in nonce.');
  }

  const nonceBody = await nonceResponse.json() as { nonce?: string };
  if (!nonceBody.nonce) {
    throw new Error('Looperlands did not return a sign-in nonce.');
  }

  const message = buildSiweMessage(walletAddress, chainId, nonceBody.nonce);
  let signature: string;
  try {
    walletLog('provider request', {
      method: 'personal_sign',
      walletAddress: maskDebugValue(walletAddress),
      chainId,
    });
    signature = await provider.request<string>({
      method: 'personal_sign',
      params: [message, walletAddress],
    });
    walletLog('provider response', { method: 'personal_sign', signature: maskDebugValue(signature) });
  } catch (error) {
    walletWarn('provider request failed', {
      method: 'personal_sign',
      error: describeWalletError(error),
    });
    throw error;
  }

  const verifyUrl = getDriftlandsLooperlandsProxyUrl('/web3/verify');
  walletLog('proxy request', {
    step: 'verify',
    url: verifyUrl,
    walletAddress: maskDebugValue(walletAddress),
    chainId,
  });
  const verifyResponse = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      signature,
      network: chainId,
      hash: hashMessage(message),
    }),
  });
  walletLog('proxy response', { step: 'verify', status: verifyResponse.status, ok: verifyResponse.ok });

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
  walletLog('looperlands connect success', {
    walletAddress: maskDebugValue(session.walletAddress),
    chainId: session.chainId,
    hasToken: session.token.length > 0,
  });
  return session;
}

export async function fetchLooperlandsLoopers(session: LooperlandsWalletSession): Promise<LooperlandsHeroSelection[]> {
  const walletLookupKeys = Array.from(new Set([
    `${session.walletAddress}:${session.chainId}`,
    session.walletAddress,
  ]));
  let lastFailedStatus: number | null = null;

  for (const walletLookupKey of walletLookupKeys) {
    const url = getDriftlandsLooperlandsProxyUrl(`/game/wallet/${encodeURIComponent(walletLookupKey)}/loopers`);
    walletLog('proxy request', {
      step: 'loopers',
      url,
      walletLookupKey: maskDebugValue(walletLookupKey),
      walletAddress: maskDebugValue(session.walletAddress),
      chainId: session.chainId,
      hasToken: session.token.length > 0,
    });
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-AUTH-WEB3TOKEN': session.token,
      },
    });
    walletLog('proxy response', {
      step: 'loopers',
      walletLookupKey: maskDebugValue(walletLookupKey),
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      lastFailedStatus = response.status;
      if ([401, 403, 500].includes(response.status)) {
        break;
      }
      continue;
    }

    const body = await response.json() as { loopers?: LooperlandsAsset[] };
    const loopers = (body.loopers ?? []).filter(isLooperAsset).map(toLooperHeroSelection);
    walletLog('loopers parsed', {
      walletLookupKey: maskDebugValue(walletLookupKey),
      count: loopers.length,
    });
    if (loopers.length > 0 || walletLookupKey === walletLookupKeys[walletLookupKeys.length - 1]) {
      return loopers;
    }
  }

  if (lastFailedStatus && [401, 403, 500].includes(lastFailedStatus)) {
    clearStoredLooperlandsSession();
  }

  throw new Error('Could not load Looper avatars for this wallet. Reconnect your wallet and try again.');
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

export async function fetchDriftlandsWalletSettlement(
  session: LooperlandsWalletSession,
  options: { throwOnUnavailable?: boolean } = {},
): Promise<string | null> {
  const playerId = getLooperlandsPlayerId(session);
  const url = getDriftlandsApiUrl(`/player/${encodeURIComponent(playerId)}/settlement`);
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, DRIFTLANDS_WALLET_SETTLEMENT_TIMEOUT_MS);

  walletLog('driftlands settlement lookup request', {
    url,
    playerId: maskDebugValue(playerId),
    timeoutMs: DRIFTLANDS_WALLET_SETTLEMENT_TIMEOUT_MS,
  });

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    walletLog('driftlands settlement lookup response', {
      status: response.status,
      ok: response.ok,
      durationMs,
    });

    if (!response.ok) {
      walletWarn('driftlands settlement lookup failed; continuing without cached settlement', {
        status: response.status,
        durationMs,
      });
      if (options.throwOnUnavailable) {
        throw new Error(`Could not check this wallet colony (${response.status}).`);
      }
      return null;
    }

    const body = await response.json() as { settlementId?: string | null };
    return body.settlementId ?? null;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    walletWarn('driftlands settlement lookup unavailable; continuing without cached settlement', {
      durationMs,
      timedOut: isAbortError(error),
      error: describeWalletError(error),
    });
    if (options.throwOnUnavailable) {
      throw error;
    }
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

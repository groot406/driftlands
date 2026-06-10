type DriftlandsImportMetaEnv = {
  DEV?: boolean;
  VITE_DRIFTLANDS_BUILD_TARGET?: unknown;
  VITE_DRIFTLANDS_SERVER_URL?: unknown;
  VITE_SERVER_URL?: unknown;
};

export const DEFAULT_DRIFTLANDS_SERVER_URL = 'https://driftlands.ddns.net';
const DRIFTLANDS_SERVER_URL_OVERRIDE_KEY = 'driftlands-server-url-v1';
let runtimeDriftlandsServerUrl = '';

function normalizeEnvUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

type DriftlandsRuntimeServerOptions = {
  hostname?: string;
  serverUrl?: unknown;
  storedServerUrl?: unknown;
};

function getBrowserHostname(): string {
  const maybeWindow = (globalThis as { window?: { location?: { hostname?: string } } }).window;
  return maybeWindow?.location?.hostname ?? '';
}

function getRuntimeServerUrl(): string {
  const maybeWindow = (globalThis as { window?: { __DRIFTLANDS_SERVER_URL__?: unknown } }).window;
  return normalizeEnvUrl(maybeWindow?.__DRIFTLANDS_SERVER_URL__);
}

export function setRuntimeDriftlandsServerUrl(value: string): string {
  runtimeDriftlandsServerUrl = normalizeEnvUrl(value);
  return runtimeDriftlandsServerUrl;
}

export function getStoredDriftlandsServerUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return normalizeEnvUrl(window.localStorage.getItem(DRIFTLANDS_SERVER_URL_OVERRIDE_KEY));
  } catch {
    return '';
  }
}

export function setStoredDriftlandsServerUrl(value: string): string {
  const normalized = normalizeEnvUrl(value);
  if (typeof window === 'undefined') {
    return normalized;
  }

  try {
    if (normalized && normalized !== DEFAULT_DRIFTLANDS_SERVER_URL) {
      window.localStorage.setItem(DRIFTLANDS_SERVER_URL_OVERRIDE_KEY, normalized);
    } else {
      window.localStorage.removeItem(DRIFTLANDS_SERVER_URL_OVERRIDE_KEY);
    }
  } catch {
  }

  return normalized;
}

function isLocalDevProxyFrontend(env: DriftlandsImportMetaEnv, hostname = getBrowserHostname()): boolean {
  if (!env.DEV) {
    return false;
  }

  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

export function getDriftlandsServerUrlFromEnv(
  env: DriftlandsImportMetaEnv,
  runtime: DriftlandsRuntimeServerOptions = {},
): string {
  const runtimeServerUrl = normalizeEnvUrl(runtime.serverUrl) || runtimeDriftlandsServerUrl || getRuntimeServerUrl();
  if (runtimeServerUrl) {
    return runtimeServerUrl;
  }

  const storedServerUrl = normalizeEnvUrl(runtime.storedServerUrl) || getStoredDriftlandsServerUrl();
  if (storedServerUrl) {
    return storedServerUrl;
  }

  if (isLocalDevProxyFrontend(env, runtime.hostname)) {
    return '';
  }

  return normalizeEnvUrl(env.VITE_DRIFTLANDS_SERVER_URL)
    || normalizeEnvUrl(env.VITE_SERVER_URL)
    || (env.VITE_DRIFTLANDS_BUILD_TARGET === 'ipad' ? DEFAULT_DRIFTLANDS_SERVER_URL : '');
}

export function getDriftlandsServerUrl(): string {
  return getDriftlandsServerUrlFromEnv(import.meta.env);
}

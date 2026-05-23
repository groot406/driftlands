type DriftlandsImportMetaEnv = {
  DEV?: boolean;
};

function normalizeEnvUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

function getBrowserHostname(): string {
  const maybeWindow = (globalThis as { window?: { location?: { hostname?: string } } }).window;
  return maybeWindow?.location?.hostname ?? '';
}

function isLocalDevProxyFrontend(env: DriftlandsImportMetaEnv): boolean {
  if (!env.DEV) {
    return false;
  }

  const hostname = getBrowserHostname();
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

export function getDriftlandsServerUrl(): string {
  const env = { DEV: import.meta.env.DEV };
  if (isLocalDevProxyFrontend(env)) {
    return '';
  }

  return normalizeEnvUrl(import.meta.env.VITE_DRIFTLANDS_SERVER_URL)
    || normalizeEnvUrl(import.meta.env.VITE_SERVER_URL);
}

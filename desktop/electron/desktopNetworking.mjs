import os from 'node:os';

export const DESKTOP_DISCOVERY_PORT = 3696;
export const DESKTOP_DISCOVERY_INTERVAL_MS = 1500;
export const DESKTOP_WORLD_SETTINGS_FILE = 'desktop-world.json';
export const DEFAULT_SHARED_WORLD_URL = 'https://driftlands.ddns.net';

export const DESKTOP_WORLD_MODES = new Set(['solo', 'lan-host', 'lan-join', 'shared']);

export function normalizeServerUrl(value) {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

export function normalizeWorldMode(value) {
  return DESKTOP_WORLD_MODES.has(value) ? value : 'solo';
}

export function getLanAddresses(networkInterfaces = os.networkInterfaces()) {
  const addresses = [];

  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !entry.address) {
        continue;
      }

      addresses.push(entry.address);
    }
  }

  return [...new Set(addresses)].sort();
}

export function buildServerUrl(host, port) {
  return `http://${host}:${port}`;
}

export function buildLanServerUrls(port, networkInterfaces = os.networkInterfaces()) {
  return getLanAddresses(networkInterfaces).map((address) => buildServerUrl(address, port));
}

export function getPrimaryLanServerUrl(port, networkInterfaces = os.networkInterfaces()) {
  return buildLanServerUrls(port, networkInterfaces)[0] ?? buildServerUrl('127.0.0.1', port);
}

export function normalizeDesktopWorldSettings(raw, defaults = {}) {
  const mode = normalizeWorldMode(raw?.mode ?? defaults.mode);
  const defaultSharedServerUrl = normalizeServerUrl(defaults.sharedServerUrl);
  const invalidSharedServerUrls = new Set((defaults.invalidSharedServerUrls ?? [])
    .map((value) => normalizeServerUrl(value))
    .filter(Boolean));
  const rawSharedServerUrl = normalizeServerUrl(raw?.sharedServerUrl);
  const sharedServerUrl = (!rawSharedServerUrl || invalidSharedServerUrls.has(rawSharedServerUrl))
    ? defaultSharedServerUrl
    : rawSharedServerUrl;
  const joinServerUrl = normalizeServerUrl(raw?.joinServerUrl ?? defaults.joinServerUrl);

  if (mode === 'shared' && !sharedServerUrl) {
    return { mode: 'solo', sharedServerUrl, joinServerUrl };
  }

  if (mode === 'lan-join' && !joinServerUrl) {
    return { mode: 'solo', sharedServerUrl, joinServerUrl };
  }

  return {
    mode,
    sharedServerUrl,
    joinServerUrl,
  };
}

export function buildDiscoveryPayload({ serverUrl, worldName = 'Driftlands LAN World' }) {
  return {
    type: 'driftlands:world',
    protocol: 1,
    name: worldName,
    serverUrl: normalizeServerUrl(serverUrl),
    timestamp: Date.now(),
  };
}

export function parseDiscoveryPayload(message) {
  let payload;
  try {
    payload = JSON.parse(String(message));
  } catch {
    return null;
  }

  if (payload?.type !== 'driftlands:world' || payload.protocol !== 1) {
    return null;
  }

  const serverUrl = normalizeServerUrl(payload.serverUrl);
  if (!serverUrl) {
    return null;
  }

  return {
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'Driftlands LAN World',
    serverUrl,
    lastSeenAt: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
  };
}

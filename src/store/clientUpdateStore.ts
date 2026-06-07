import { ref } from 'vue';

import {
  buildClientVersionManifest,
  CLIENT_VERSION_MANIFEST_PATH,
  type ClientVersionManifest,
  isDifferentClientVersion,
} from '../shared/changelog/clientVersion.ts';
import { generatedChangelogEntries } from '../shared/changelog/generated.ts';

type VersionFetch = typeof fetch;

export const currentClientVersion = buildClientVersionManifest(generatedChangelogEntries);
export const clientUpdateRequired = ref(false);
export const availableClientVersion = ref<ClientVersionManifest | null>(null);

let updateCheckInFlight: Promise<void> | null = null;

export function getClientVersionManifestUrls(location: Pick<Location, 'origin' | 'href'> = window.location): string[] {
  return [
    new URL(`/${CLIENT_VERSION_MANIFEST_PATH}`, location.origin).toString(),
    new URL(CLIENT_VERSION_MANIFEST_PATH, location.href).toString(),
  ].filter((url, index, urls) => urls.indexOf(url) === index);
}

export async function checkForClientUpdate(
  fetcher: VersionFetch = fetch,
  urls: string[] = getClientVersionManifestUrls(),
): Promise<void> {
  if (updateCheckInFlight) {
    return updateCheckInFlight;
  }

  updateCheckInFlight = runClientUpdateCheck(fetcher, urls).finally(() => {
    updateCheckInFlight = null;
  });
  return updateCheckInFlight;
}

export function resetClientUpdateStore() {
  clientUpdateRequired.value = false;
  availableClientVersion.value = null;
  updateCheckInFlight = null;
}

async function runClientUpdateCheck(fetcher: VersionFetch, urls: string[]) {
  for (const url of urls) {
    const manifest = await fetchClientVersionManifest(fetcher, url);
    if (!manifest) {
      continue;
    }

    if (isDifferentClientVersion(currentClientVersion, manifest)) {
      availableClientVersion.value = manifest;
      clientUpdateRequired.value = true;
    }
    return;
  }
}

async function fetchClientVersionManifest(fetcher: VersionFetch, url: string): Promise<ClientVersionManifest | null> {
  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload || typeof payload.clientReleaseId !== 'string') {
      return null;
    }

    return {
      clientReleaseId: payload.clientReleaseId,
      releasedAt: typeof payload.releasedAt === 'number' ? payload.releasedAt : null,
      gitHead: typeof payload.gitHead === 'string' ? payload.gitHead : null,
    };
  } catch {
    return null;
  }
}

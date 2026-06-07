const bundledSoundAssets: Record<string, string> = {
  'chat-incoming.wav': new URL('../assets/sounds/chat-incoming.wav', import.meta.url).href,
  'chopping.wav': new URL('../assets/sounds/chopping.wav', import.meta.url).href,
  'drop.mp3': new URL('../assets/sounds/drop.mp3', import.meta.url).href,
  'mining.mp3': new URL('../assets/sounds/mining.mp3', import.meta.url).href,
  'splash.mp3': new URL('../assets/sounds/splash.mp3', import.meta.url).href,
  'success.mp3': new URL('../assets/sounds/success.mp3', import.meta.url).href,
  'take.mp3': new URL('../assets/sounds/take.mp3', import.meta.url).href,
  'walking.mp3': new URL('../assets/sounds/walking.mp3', import.meta.url).href,
};

interface ResolveSoundAssetOptions {
  serverBaseUrl?: string;
}

function normalizeServerBaseUrl(value: string | undefined) {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

function getBundledSoundName(soundPath: string) {
  if (!soundPath || soundPath.includes('://') || soundPath.startsWith('blob:') || soundPath.startsWith('data:')) {
    return null;
  }

  const match = soundPath.match(/(?:^|\/)sounds\/([^/?#]+)(?:[?#].*)?$/);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  if (!soundPath.startsWith('/') && !soundPath.includes('/')) {
    return soundPath.split(/[?#]/, 1)[0] || null;
  }

  return null;
}

export function resolveSoundAssetUrl(soundPath: string, options: ResolveSoundAssetOptions = {}) {
  if (
    soundPath.startsWith('http://')
    || soundPath.startsWith('https://')
    || soundPath.startsWith('blob:')
    || soundPath.startsWith('data:')
  ) {
    return soundPath;
  }

  const bundledName = getBundledSoundName(soundPath);
  if (bundledName && bundledSoundAssets[bundledName]) {
    return bundledSoundAssets[bundledName];
  }

  const baseUrl = normalizeServerBaseUrl(options.serverBaseUrl);
  const assetPath = soundPath.startsWith('/') ? soundPath : `/sounds/${soundPath}`;
  return `${baseUrl}${assetPath}`;
}

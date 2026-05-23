import { createAppKit } from '@reown/appkit/vue';
import { mainnet, polygon, arbitrum, optimism, base, taiko } from '@reown/appkit/networks';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { maskDebugValue, walletLog, walletWarn } from './walletDebug.ts';

let initialized = false;
let appKitClient: ReturnType<typeof createAppKit> | null = null;

function getWalletConnectProjectIdSource(): string {
  if (import.meta.env.VITE_DRIFTLANDS_WALLETCONNECT_PROJECT_ID) return 'VITE_DRIFTLANDS_WALLETCONNECT_PROJECT_ID';
  if (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID) return 'VITE_WALLETCONNECT_PROJECT_ID';
  if (import.meta.env.VITE_WC_PROJECT_ID) return 'VITE_WC_PROJECT_ID';
  return '(missing)';
}

export function getWalletConnectProjectId(): string {
  return (
    import.meta.env.VITE_DRIFTLANDS_WALLETCONNECT_PROJECT_ID
    ?? import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
    ?? import.meta.env.VITE_WC_PROJECT_ID
    ?? ''
  ).trim();
}

export function isWalletConnectConfigured(): boolean {
  return getWalletConnectProjectId().length > 0;
}

export function getWalletConnectAppKitClient(): ReturnType<typeof createAppKit> | null {
  return appKitClient;
}

export function getWalletConnectDebugInfo(): Record<string, unknown> {
  const projectId = getWalletConnectProjectId();
  return {
    configured: projectId.length > 0,
    projectId: maskDebugValue(projectId),
    projectIdSource: getWalletConnectProjectIdSource(),
    origin: typeof window !== 'undefined' ? window.location.origin : '(server)',
    host: typeof window !== 'undefined' ? window.location.host : '(server)',
    mode: import.meta.env.MODE,
    appKitInitialized: initialized,
  };
}

export function initializeWalletConnectAppKit(): boolean {
  if (!isWalletConnectConfigured()) {
    walletWarn('appkit not configured', getWalletConnectDebugInfo());
    return false;
  }

  if (initialized) {
    walletLog('appkit already initialized', getWalletConnectDebugInfo());
    return true;
  }

  walletLog('appkit initializing', getWalletConnectDebugInfo());
  appKitClient = createAppKit({
    adapters: [new EthersAdapter()],
    networks: [mainnet, polygon, arbitrum, optimism, base, taiko],
    defaultNetwork: mainnet,
    projectId: getWalletConnectProjectId(),
    metadata: {
      name: 'Driftlands',
      description: 'Driftlands colony platform',
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
    themeMode: 'dark',
    allowUnsupportedChain: true,
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
    },
  });

  initialized = true;
  walletLog('appkit initialized', getWalletConnectDebugInfo());
  return true;
}

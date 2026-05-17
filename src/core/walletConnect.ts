import { createAppKit } from '@reown/appkit/vue';
import { mainnet, polygon, arbitrum, optimism, base, taiko } from '@reown/appkit/networks';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

let initialized = false;

export function getWalletConnectProjectId(): string {
  return (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '').trim();
}

export function isWalletConnectConfigured(): boolean {
  return getWalletConnectProjectId().length > 0;
}

export function initializeWalletConnectAppKit(): boolean {
  if (!isWalletConnectConfigured()) {
    return false;
  }

  if (initialized) {
    return true;
  }

  createAppKit({
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
  return true;
}

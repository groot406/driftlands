<template>
  <div class="title-screen">
    <TitleBackground :move="true" :blur="10" />
    <div class="title-screen__shade" aria-hidden="true" />
    <div class="title-screen__texture" aria-hidden="true" />
    <main class="title-screen__content" aria-label="Driftlands title screen">
      <section class="title-menu rounded-xl backdrop-blur-xl opacity-95">
        <img class="title-menu__logo" :src="logoArt" alt="Driftlands" />

        <div class="title-menu__meta" aria-label="Current run">
          <span>{{ previewStory.chapterLabel }}</span>
          <span>{{ previewStory.actLabel }}</span>
        </div>

        <form class="title-menu__account" @submit.prevent="joinGame">
          <label for="player-nickname">Nickname</label>
          <input
            id="player-nickname"
            v-model="nickname"
            type="text"
            maxlength="24"
            autocomplete="nickname"
          />
          <div class="title-start-mode" role="group" aria-label="Start mode">
            <button
              type="button"
              :class="{ 'title-start-mode__button--active': startMode === 'wallet' }"
              @click="startMode = 'wallet'"
            >
              Wallet
            </button>
            <button
              type="button"
              :class="{ 'title-start-mode__button--active': startMode === 'default' }"
              @click="startMode = 'default'"
            >
              No Wallet
            </button>
          </div>

          <div v-if="startMode === 'wallet'" class="title-wallet">
            <button
              v-if="!walletSession"
              class="title-menu__button title-menu__button--wallet"
              type="button"
              :disabled="walletLoading"
              @click="connectWallet"
            >
              {{ walletLoading ? 'Connecting Wallet' : 'Connect Wallet' }}
            </button>
            <div v-else class="title-wallet__connected">
              <span>{{ shortWallet }}</span>
              <button type="button" @click="disconnectWallet">Disconnect</button>
            </div>
            <p v-if="walletSettlementLoading" class="title-wallet__notice">Checking existing colony...</p>
            <p v-else-if="existingWalletSettlementId" class="title-wallet__notice">This wallet already founded a colony. Continue to rejoin it.</p>
            <p v-else-if="walletSettlementLookupUncertain" class="title-wallet__notice">Could not confirm this wallet's colony yet. Continue will ask the server again.</p>
            <p v-if="walletError" class="title-wallet__error">{{ walletError }}</p>
          </div>

          <div v-if="walletReadyForLooperSelection" class="title-loopers" aria-label="Choose two Looper avatars">
            <p class="title-loopers__label">{{ looperPickerLabel }}</p>
            <div v-if="looperLoading" class="title-loopers__status">Loading avatars...</div>
            <div v-else-if="loopers.length" class="title-loopers__grid">
              <button
                v-for="looper in loopers"
                :key="looper.id"
                type="button"
                class="title-looper"
                :class="{ 'title-looper--selected': selectedLooperIds.includes(looper.id) }"
                :title="looper.name"
                @click="toggleLooper(looper.id)"
              >
                <Sprite
                  :sprite="looper.spriteUrl"
                  :fallback-sprite="looper.fallbackSpriteUrl"
                  :zoom="2.35"
                  :row="8"
                  :size="32"
                  :frames="2"
                  :speed="450"
                />
              </button>
            </div>
            <div v-else class="title-loopers__status">No Looper avatars found for this wallet.</div>
          </div>

          <div v-if="startMode === 'default' && existingDefaultSettlementId" class="title-wallet">
            <p class="title-wallet__notice">This browser already founded a colony. Continue to rejoin it.</p>
          </div>

          <div v-else-if="startMode === 'default'" class="title-loopers" aria-label="Choose two default heroes">
            <p v-if="defaultSettlementLoading" class="title-wallet__notice">Checking existing colony...</p>
            <p class="title-loopers__label">{{ defaultPickerLabel }}</p>
            <div class="title-loopers__grid title-loopers__grid--default">
              <button
                v-for="hero in defaultHeroes"
                :key="hero.id"
                type="button"
                class="title-looper title-default-hero"
                :class="{ 'title-looper--selected': selectedDefaultHeroIds.includes(hero.id) }"
                :title="`${hero.name} - ${hero.role}`"
                @click="toggleDefaultHero(hero.id)"
              >
                <span class="title-looper__sprite">
                  <Sprite
                    :sprite="hero.avatar"
                    :zoom="2.15"
                    :row="8"
                    :size="32"
                    :frames="2"
                    :speed="450"
                  />
                </span>
                <span class="title-looper__name">{{ hero.name }}</span>
                <span class="title-looper__role">{{ hero.role }}</span>
              </button>
            </div>
          </div>

          <div class="title-actions" aria-label="Game actions">
            <button class="title-menu__button title-menu__button--primary" type="submit" :disabled="!canStart">{{ primaryActionLabel }}</button>
            <button
              class="title-menu__button title-menu__button--spectator"
              type="button"
              :disabled="startMode === 'wallet' && (!walletSession || walletLoading)"
              @click="spectateGame"
            >
              Spectate World
            </button>
            <p class="title-wallet__notice title-actions__hint">Watch seasons and scoreboards without founding a settlement.</p>
          </div>
        </form>

        <div class="title-menu__story">
          <p class="title-menu__eyebrow">Current Story</p>
          <h1>{{ previewStory.title }}</h1>
          <p>{{ currentRun ? previewStory.guidance : previewStory.briefing }}</p>
        </div>
      </section>

    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from '@reown/appkit/vue';
import type { ProviderType } from '@reown/appkit-adapter-ethers';
import TitleBackground from './TitleBackground.vue';
import Sprite from './Sprite.vue';
import { resumeGame } from '../store/uiStore.ts';
import { runSnapshot } from '../store/runStore.ts';
import { musicManager } from '../core/musicManager.ts';
import { connectWithNickname, getStoredPlayerId, getStoredPlayerName } from '../core/socket.ts';
import { getDriftlandsServerUrl } from '../core/driftlandsServerUrl.ts';
import {
  buildLooperlandsContinueAuth,
  buildLooperlandsJoinAuth,
  clearStoredLooperlandsSession,
  connectLooperlandsWallet,
  fetchDriftlandsWalletSettlement,
  fetchLooperlandsLoopers,
  getAuthorizedLooperlandsWalletIdentity,
  getStoredLooperlandsSession,
  hasLooperlandsPlatformSessionCandidate,
  restoreLooperlandsPlatformSession,
  type EthereumProvider,
  type LooperlandsWalletSession,
} from '../core/looperlandsClient.ts';
import { getWalletConnectAppKitClient, getWalletConnectDebugInfo, initializeWalletConnectAppKit } from '../core/walletConnect.ts';
import { describeWalletError, maskDebugValue, walletLog, walletWarn } from '../core/walletDebug.ts';
import { listStoryHeroTemplates, type StoryHeroId } from '../shared/story/heroRoster.ts';
import type { LooperlandsHeroSelection } from '../shared/looperlands.ts';
import logoArt from '../assets/ui/logo.png';
import boyAvatar from '../assets/heroes/boy.png';
import girlAvatar from '../assets/heroes/girl.png';
import loopheadAvatar from '../assets/heroes/loophead.png';
import mosslingAvatar from '../assets/heroes/mossling.png';
import santaAvatar from '../assets/heroes/santa.png';

const openingStory = {
  chapterId: 'landfall',
  chapterLabel: 'Landfall',
  actLabel: 'Opening Days',
  title: 'A New Landing',
  kicker: 'A handful of people, a rough shoreline, and just enough supplies to start making promises.',
  briefing: 'Gather the first stockpile, raise shelter, and turn scattered labor into the first real production chain.',
  stakes: 'If housing, food, and work fall out of balance, the colony stalls before it becomes self-sustaining.',
  guidance: 'Build the next useful thing, then make sure the colony has enough beds and workers to keep it running.',
  completionTitle: 'The colony finds its footing',
  completionText: 'The first loop holds. From here on, each new structure can unlock the next.',
  failureTitle: 'The landing goes quiet',
  failureText: 'Without enough shelter, food, and labor, the frontier stops moving.',
  nextHint: 'The next unlock comes from the colony state itself, not a mission list.',
};

const avatarByKey: Record<string, string> = {
  boy: boyAvatar,
  girl: girlAvatar,
  loophead: loopheadAvatar,
  mossling: mosslingAvatar,
  santa: santaAvatar,
};
const walletConnectEnabled = initializeWalletConnectAppKit();
const appKit = walletConnectEnabled ? useAppKit() : null;
const appKitAccount = walletConnectEnabled ? useAppKitAccount({ namespace: 'eip155' }) : null;
const appKitProvider = walletConnectEnabled ? useAppKitProvider<ProviderType>('eip155') : null;
const appKitDisconnect = walletConnectEnabled ? useDisconnect() : null;
walletLog('title wallet setup', {
  walletConnectEnabled,
  appKit: !!appKit,
  appKitAccount: !!appKitAccount,
  appKitProvider: !!appKitProvider,
  ...getWalletConnectDebugInfo(),
});

const currentRun = computed(() => runSnapshot.value);
const nickname = ref(getStoredPlayerName());
const walletSession = ref<LooperlandsWalletSession | null>(getStoredLooperlandsSession());
const startMode = ref<'wallet' | 'default'>(walletSession.value ? 'wallet' : 'default');
const walletLoading = ref(false);
const walletError = ref('');
const walletSettlementLoading = ref(false);
const existingWalletSettlementId = ref<string | null>(null);
const walletSettlementLookupUncertain = ref(false);
const defaultSettlementLoading = ref(false);
const existingDefaultSettlementId = ref<string | null>(null);
const looperLoading = ref(false);
const loopers = ref<LooperlandsHeroSelection[]>([]);
const selectedLooperIds = ref<string[]>([]);
let walletPreparationRunId = 0;
const selectedDefaultHeroIds = ref<StoryHeroId[]>(['h2', 'h3']);
const previewStory = computed(() => currentRun.value?.chapter ?? openingStory);
const defaultHeroes = computed(() => listStoryHeroTemplates().map((hero) => ({
  ...hero,
  avatar: avatarByKey[hero.avatar] ?? santaAvatar,
})));
const existingSettlementId = computed(() => (
  startMode.value === 'wallet'
    ? existingWalletSettlementId.value
    : existingDefaultSettlementId.value
));
const primaryActionLabel = computed(() => {
  if (existingSettlementId.value || (startMode.value === 'wallet' && walletSettlementLookupUncertain.value)) {
    return 'Continue Colony';
  }

  return currentRun.value ? 'Continue Colony' : 'Start Colony';
});
const selectedLoopers = computed(() => selectedLooperIds.value
  .map((id) => loopers.value.find((looper) => looper.id === id))
  .filter((looper): looper is LooperlandsHeroSelection => !!looper));
const selectedDefaultHeroes = computed(() => selectedDefaultHeroIds.value
  .map((id) => defaultHeroes.value.find((hero) => hero.id === id))
  .filter((hero): hero is NonNullable<typeof hero> => !!hero));
const canStart = computed(() => {
  if (startMode.value === 'default') {
    return !!existingDefaultSettlementId.value || selectedDefaultHeroes.value.length === 2;
  }

  if (!walletSession.value || walletLoading.value || walletSettlementLoading.value || looperLoading.value) {
    return false;
  }

  if (existingWalletSettlementId.value || walletSettlementLookupUncertain.value) {
    return true;
  }

  return selectedLoopers.value.length === 2;
});
const walletReadyForLooperSelection = computed(() => (
  startMode.value === 'wallet'
  && !!walletSession.value
  && !walletLoading.value
  && !walletSettlementLoading.value
  && !existingWalletSettlementId.value
));
const shortWallet = computed(() => {
  const address = walletSession.value?.walletAddress ?? '';
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
});
const looperPickerLabel = computed(() => {
  const count = selectedLoopers.value.length;
  return count === 2 ? 'Two avatars selected' : `Choose ${2 - count} more Looper avatar${2 - count === 1 ? '' : 's'}`;
});
const defaultPickerLabel = computed(() => {
  const count = selectedDefaultHeroes.value.length;
  return count === 2 ? 'Two default heroes selected' : `Choose ${2 - count} more default hero${2 - count === 1 ? '' : 'es'}`;
});
onMounted(() => {
  musicManager.initialize();
  void refreshExistingDefaultSettlement();

  if (walletSession.value) {
    void prepareWalletStart();
  }

  window.addEventListener('pointerdown', retryTitleMusic, { once: true });
  window.addEventListener('keydown', retryTitleMusic, { once: true });
});

watch(startMode, (mode) => {
  if (mode === 'default') {
    void refreshExistingDefaultSettlement();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', retryTitleMusic);
  window.removeEventListener('keydown', retryTitleMusic);
});

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getWalletSessionKey(session: LooperlandsWalletSession | null): string {
  return session ? `${session.walletAddress.toLowerCase()}:${session.chainId}:${session.token}` : '';
}

function isCurrentWalletPreparation(runId: number, session: LooperlandsWalletSession): boolean {
  return walletPreparationRunId === runId
    && getWalletSessionKey(walletSession.value) === getWalletSessionKey(session);
}

function walletIdentityMatchesSession(
  identity: { walletAddress: string; chainId: number } | null,
  session: LooperlandsWalletSession,
): boolean {
  return !identity
    || (identity.walletAddress.toLowerCase() === session.walletAddress.toLowerCase() && identity.chainId === session.chainId);
}

function isEthereumProvider(provider: unknown): provider is EthereumProvider {
  return !!provider && typeof (provider as EthereumProvider).request === 'function';
}

function unwrapAppKitProvider(provider: unknown): unknown {
  if (isEthereumProvider(provider)) {
    return provider;
  }

  if (provider && typeof provider === 'object' && 'value' in provider) {
    return (provider as { value?: unknown }).value;
  }

  return undefined;
}

function describeProviderCandidate(label: string, provider: unknown): Record<string, unknown> {
  const unwrapped = unwrapAppKitProvider(provider);
  const rawObject = provider && typeof provider === 'object' ? provider as Record<string, unknown> : null;
  const unwrappedObject = unwrapped && typeof unwrapped === 'object' ? unwrapped as Record<string, unknown> : null;
  return {
    label,
    present: !!provider,
    rawType: typeof provider,
    rawConstructor: rawObject?.constructor?.name,
    rawHasValue: !!rawObject && 'value' in rawObject,
    rawHasRequest: isEthereumProvider(provider),
    unwrappedPresent: !!unwrapped,
    unwrappedType: typeof unwrapped,
    unwrappedConstructor: unwrappedObject?.constructor?.name,
    unwrappedHasRequest: isEthereumProvider(unwrapped),
  };
}

function getProviderCandidates(): Array<{ label: string; provider: unknown }> {
  const appKitClient = getWalletConnectAppKitClient();
  return [
    { label: 'useAppKitProvider.walletProvider', provider: appKitProvider?.walletProvider },
    { label: 'appKitClient.getProvider(eip155)', provider: appKitClient?.getProvider('eip155') },
    { label: 'appKitClient.getWalletProvider()', provider: appKitClient?.getWalletProvider() },
    { label: 'window.ethereum', provider: window.ethereum },
  ];
}

function logWalletState(event: string): void {
  walletLog(event, {
    account: appKitAccount?.value ? {
      isConnected: appKitAccount.value.isConnected,
      status: appKitAccount.value.status,
      address: appKitAccount.value.address ? `${appKitAccount.value.address.slice(0, 6)}...${appKitAccount.value.address.slice(-4)}` : undefined,
      caipAddress: appKitAccount.value.caipAddress,
    } : null,
    providerType: appKitProvider?.walletProviderType,
    candidates: getProviderCandidates().map((candidate) => describeProviderCandidate(candidate.label, candidate.provider)),
  });
}

function getAppKitEthereumProvider(options: { logSelection?: boolean } = {}): EthereumProvider | undefined {
  for (const candidate of getProviderCandidates()) {
    const provider = unwrapAppKitProvider(candidate.provider);
    if (isEthereumProvider(provider)) {
      if (options.logSelection !== false) {
        walletLog('provider selected', { source: candidate.label });
      }
      return provider;
    }
  }

  return undefined;
}

async function connectAppKitProvider(): Promise<EthereumProvider | undefined> {
  if (!walletConnectEnabled || !appKit || !appKitAccount || !appKitProvider) {
    walletWarn('appkit unavailable', {
      walletConnectEnabled,
      appKit: !!appKit,
      appKitAccount: !!appKitAccount,
      appKitProvider: !!appKitProvider,
    });
    return undefined;
  }

  logWalletState('connectAppKitProvider start');
  const authorizedProvider = getAppKitEthereumProvider();
  const authorizedIdentity = authorizedProvider
    ? await getAuthorizedLooperlandsWalletIdentity(authorizedProvider)
    : null;
  if (authorizedProvider && authorizedIdentity) {
    walletLog('connectAppKitProvider using authorized provider', {
      walletAddress: maskDebugValue(authorizedIdentity.walletAddress),
      chainId: authorizedIdentity.chainId,
    });
    return authorizedProvider;
  }

  if (!appKitAccount.value.isConnected || !authorizedProvider) {
    try {
      walletLog('appkit open connect modal');
      await appKit.open({ view: 'Connect', namespace: 'eip155' });
      logWalletState('appkit open resolved');
    } catch (error) {
      walletWarn('appkit open failed', { error: describeWalletError(error) });
      throw error;
    }
  }

  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt < 120000) {
    attempt += 1;
    const provider = getAppKitEthereumProvider({ logSelection: attempt === 1 });
    if (provider) {
      logWalletState(appKitAccount.value.isConnected
        ? 'connectAppKitProvider ready'
        : 'connectAppKitProvider provider ready before appkit account state');
      return provider;
    }

    if ([1, 5, 10, 20, 40].includes(attempt) || attempt % 100 === 0) {
      logWalletState(`connectAppKitProvider waiting attempt ${attempt}`);
    }

    await delay(150);
  }

  logWalletState('connectAppKitProvider timeout');
  throw new Error('WalletConnect connection was not completed.');
}

async function connectWallet() {
  const runId = ++walletPreparationRunId;
  walletLoading.value = true;
  walletError.value = '';
  try {
    walletLog('connect wallet clicked', {
      startMode: startMode.value,
      hasPlatformSessionCandidate: hasLooperlandsPlatformSessionCandidate(),
    });
    const platformSession = await restoreLooperlandsPlatformSession().catch((error) => {
      walletWarn('platform session restore failed; falling back to appkit', { error: describeWalletError(error) });
      return null;
    });
    if (platformSession) {
      walletLog('connect wallet using platform session');
      walletSession.value = platformSession;
    } else {
      walletLog('connect wallet falling back to appkit');
      const provider = await connectAppKitProvider();
      walletSession.value = await connectLooperlandsWallet(provider);
    }
    selectedLooperIds.value = [];
    existingWalletSettlementId.value = null;
    walletSettlementLookupUncertain.value = false;
    await prepareWalletStart(runId);
    walletLog('connect wallet success');
  } catch (error) {
    walletWarn('connect wallet failed', { error: describeWalletError(error) });
    walletError.value = error instanceof Error ? error.message : 'Could not connect wallet.';
  } finally {
    if (walletPreparationRunId === runId) {
      walletLoading.value = false;
    }
  }
}

function disconnectWallet() {
  walletLog('disconnect wallet clicked');
  walletPreparationRunId++;
  clearStoredLooperlandsSession();
  if (appKitDisconnect) {
    void appKitDisconnect.disconnect({ namespace: 'eip155' }).catch((error) => {
      console.warn('Failed to disconnect WalletConnect session:', error);
    });
  }
  walletSession.value = null;
  existingWalletSettlementId.value = null;
  walletSettlementLookupUncertain.value = false;
  loopers.value = [];
  selectedLooperIds.value = [];
  walletError.value = '';
  walletSettlementLoading.value = false;
  looperLoading.value = false;
}

async function prepareWalletStart(runId = ++walletPreparationRunId) {
  let session = walletSession.value;
  if (!session) {
    return;
  }

  walletLog('prepare wallet start', {
    runId,
    walletAddress: maskDebugValue(session.walletAddress),
    chainId: session.chainId,
  });
  loopers.value = [];
  selectedLooperIds.value = [];
  walletSettlementLookupUncertain.value = false;

  const providerIdentity = await getAuthorizedLooperlandsWalletIdentity(getAppKitEthereumProvider({ logSelection: false }));
  if (!isCurrentWalletPreparation(runId, session)) {
    walletLog('prepare wallet ignored stale provider identity', { runId });
    return;
  }

  if (!walletIdentityMatchesSession(providerIdentity, session)) {
    walletWarn('stored wallet session does not match authorized provider', {
      runId,
      sessionWallet: maskDebugValue(session.walletAddress),
      sessionChainId: session.chainId,
      providerWallet: maskDebugValue(providerIdentity?.walletAddress),
      providerChainId: providerIdentity?.chainId,
    });
    clearStoredLooperlandsSession();
    walletSession.value = null;
    existingWalletSettlementId.value = null;
    walletSettlementLookupUncertain.value = false;
    walletError.value = 'MetaMask is connected to a different wallet. Reconnect to load the right colony.';
    return;
  }

  session = walletSession.value;
  if (!session) {
    return;
  }

  const settlementId = await refreshExistingWalletSettlement(session, runId);
  if (!isCurrentWalletPreparation(runId, session)) {
    walletLog('prepare wallet ignored stale settlement result', { runId });
    return;
  }

  if (!settlementId) {
    const loadedLoopers = await loadLoopers(session, runId);
    if (!isCurrentWalletPreparation(runId, session)) {
      walletLog('prepare wallet ignored stale looper result', { runId });
      return;
    }

    if (loadedLoopers.length === 0) {
      await delay(650);
      const lateSettlementId = await refreshExistingWalletSettlement(session, runId);
      if (isCurrentWalletPreparation(runId, session) && lateSettlementId) {
        loopers.value = [];
        selectedLooperIds.value = [];
      }
    }
  } else {
    loopers.value = [];
    selectedLooperIds.value = [];
  }

  walletLog('prepare wallet complete', {
    runId,
    hasSettlement: !!existingWalletSettlementId.value,
    looperCount: loopers.value.length,
  });
}

async function refreshExistingWalletSettlement(session = walletSession.value, runId = walletPreparationRunId) {
  if (!session) {
    existingWalletSettlementId.value = null;
    walletSettlementLookupUncertain.value = false;
    return null;
  }

  walletSettlementLoading.value = true;
  walletError.value = '';
  try {
    let settlementId: string | null = null;
    let lastLookupError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        settlementId = await fetchDriftlandsWalletSettlement(session, { throwOnUnavailable: true });
        lastLookupError = null;
      } catch (error) {
        lastLookupError = error;
      }
      if (settlementId || attempt === 2) {
        break;
      }
      await delay(500);
    }
    if (lastLookupError) {
      throw lastLookupError;
    }
    if (!isCurrentWalletPreparation(runId, session)) {
      return null;
    }

    existingWalletSettlementId.value = settlementId;
    walletSettlementLookupUncertain.value = false;
    walletLog('wallet settlement lookup complete', {
      runId,
      hasSettlement: !!settlementId,
      settlementId: settlementId ?? null,
    });
    return settlementId;
  } catch (error) {
    if (!isCurrentWalletPreparation(runId, session)) {
      return null;
    }

    existingWalletSettlementId.value = null;
    walletSettlementLookupUncertain.value = true;
    walletWarn('wallet settlement lookup uncertain', {
      runId,
      error: describeWalletError(error),
    });
    return null;
  } finally {
    if (isCurrentWalletPreparation(runId, session)) {
      walletSettlementLoading.value = false;
    }
  }
}

async function loadLoopers(session = walletSession.value, runId = walletPreparationRunId) {
  if (!session) {
    return [];
  }

  looperLoading.value = true;
  walletError.value = '';
  try {
    let loadedLoopers: LooperlandsHeroSelection[] = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      loadedLoopers = await fetchLooperlandsLoopers(session);
      if (!isCurrentWalletPreparation(runId, session)) {
        return [];
      }

      walletLog('looper load attempt complete', {
        runId,
        attempt,
        count: loadedLoopers.length,
      });
      if (loadedLoopers.length > 0 || attempt === 3) {
        break;
      }

      await delay(attempt * 650);
    }

    if (!isCurrentWalletPreparation(runId, session)) {
      return [];
    }

    loopers.value = loadedLoopers;
    selectedLooperIds.value = selectedLooperIds.value.filter((id) => loadedLoopers.some((looper) => looper.id === id));
    return loadedLoopers;
  } catch (error) {
    if (!isCurrentWalletPreparation(runId, session)) {
      return [];
    }

    walletError.value = error instanceof Error ? error.message : 'Could not load Looper avatars.';
    return [];
  } finally {
    if (isCurrentWalletPreparation(runId, session)) {
      looperLoading.value = false;
    }
  }
}

async function refreshExistingDefaultSettlement() {
  const playerId = getStoredPlayerId();
  defaultSettlementLoading.value = true;
  try {
    const serverUrl = getDriftlandsServerUrl();
    const response = await fetch(`${serverUrl}/api/driftlands/player/${encodeURIComponent(playerId)}/settlement`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      existingDefaultSettlementId.value = null;
      return null;
    }

    const body = await response.json() as { settlementId?: string | null };
    existingDefaultSettlementId.value = body.settlementId ?? null;
    return existingDefaultSettlementId.value;
  } catch (error) {
    console.warn('[driftlands] default settlement lookup failed:', error);
    existingDefaultSettlementId.value = null;
    return null;
  } finally {
    defaultSettlementLoading.value = false;
  }
}

function toggleLooper(id: string) {
  if (selectedLooperIds.value.includes(id)) {
    selectedLooperIds.value = selectedLooperIds.value.filter((selectedId) => selectedId !== id);
    return;
  }

  if (selectedLooperIds.value.length >= 2) {
    selectedLooperIds.value = [selectedLooperIds.value[1]!, id];
    return;
  }

  selectedLooperIds.value = [...selectedLooperIds.value, id];
}

function toggleDefaultHero(id: StoryHeroId) {
  if (selectedDefaultHeroIds.value.includes(id)) {
    selectedDefaultHeroIds.value = selectedDefaultHeroIds.value.filter((selectedId) => selectedId !== id);
    return;
  }

  if (selectedDefaultHeroIds.value.length >= 2) {
    selectedDefaultHeroIds.value = [selectedDefaultHeroIds.value[1]!, id];
    return;
  }

  selectedDefaultHeroIds.value = [...selectedDefaultHeroIds.value, id];
}

function joinGame() {
  if (startMode.value === 'default') {
    if (existingDefaultSettlementId.value) {
      connectWithNickname(nickname.value, null);
      resumeGame();
      return;
    }

    if (selectedDefaultHeroes.value.length !== 2) {
      walletError.value = 'Choose two default heroes first.';
      return;
    }

    connectWithNickname(nickname.value, null, selectedDefaultHeroIds.value);
    resumeGame();
    return;
  }

  if (!walletSession.value) {
    walletError.value = 'Connect a wallet and choose two Looper avatars first.';
    return;
  }

  if (existingWalletSettlementId.value) {
    connectWithNickname(nickname.value, buildLooperlandsContinueAuth(walletSession.value));
    resumeGame();
    return;
  }

  if (walletSettlementLookupUncertain.value) {
    connectWithNickname(nickname.value, buildLooperlandsContinueAuth(walletSession.value));
    resumeGame();
    return;
  }

  if (selectedLoopers.value.length !== 2) {
    walletError.value = 'Choose two Looper avatars first.';
    return;
  }

  connectWithNickname(nickname.value, buildLooperlandsJoinAuth(walletSession.value, selectedLoopers.value));
  resumeGame();
}

function spectateGame() {
  if (startMode.value === 'wallet' && !walletSession.value) {
    walletError.value = 'Connect a wallet first, or switch to No Wallet to spectate anonymously.';
    return;
  }

  connectWithNickname(
    nickname.value,
    startMode.value === 'wallet' && walletSession.value ? buildLooperlandsContinueAuth(walletSession.value) : null,
    null,
    { spectator: true },
  );
  resumeGame();
}

function retryTitleMusic() {
  musicManager.playTitleMusic().catch((error) => console.warn('Failed to play title music:', error));
}
</script>

<style scoped>
.title-screen {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: #07151b;
  color: #fff7df;
}

.title-screen__shade {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 45% 38%, rgba(251, 191, 36, 0.16), transparent 34%),
    linear-gradient(90deg, rgba(4, 14, 19, 0.86) 0%, rgba(4, 14, 19, 0.62) 35%, rgba(4, 14, 19, 0.2) 70%),
    linear-gradient(0deg, rgba(4, 14, 19, 0.7) 0%, rgba(4, 14, 19, 0.05) 48%, rgba(4, 14, 19, 0.34) 100%);
}

.title-screen__texture {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 100% 3px;
  mix-blend-mode: soft-light;
  opacity: 0.22;
  pointer-events: none;
}

.title-screen__content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: clamp(1rem, 2.5vw, 2rem);
}

.title-menu {
  border-radius: 28px;
  box-shadow: 0 20px 46px rgba(3, 10, 12, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.12), 2px 3px 25px rgba(3, 10, 12, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(25px) saturate(158%) sepia(0.12);
  background: rgba(8, 27, 22, 0.86);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  text-align: center;
  width: min(43rem, 100%);
}

.title-menu__logo {
  height: auto;
  margin: 0.65rem auto;
  max-height: 6.6rem;
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.45));
}

.title-menu__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 0.65rem;
  font-size: 0.62rem;
  line-height: 1;
  text-transform: uppercase;
  color: #f8e7a0;
}

.title-menu__meta span {
  border: 1px solid rgba(248, 231, 160, 0.28);
  border-radius: 999px;
  background: rgba(2, 8, 10, 0.34);
  padding: 0.42rem 0.56rem;
}

.title-menu__account {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.85rem;
  text-align: left;
}

.title-menu__account label {
  color: #f8e7a0;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.title-menu__account input {
  width: 100%;
  min-height: 3rem;
  border: 1px solid rgba(248, 231, 160, 0.34);
  border-radius: 8px;
  background: rgba(2, 8, 10, 0.48);
  color: #fff7df;
  padding: 0 0.85rem;
  font-size: 1rem;
  outline: none;
}

.title-menu__account input:focus {
  border-color: rgba(248, 231, 160, 0.72);
  box-shadow: 0 0 0 3px rgba(248, 231, 160, 0.14);
}

.title-menu__button {
  width: 100%;
  border-radius: 12px;
  font-weight: 800;
  letter-spacing: 0;
  transition: transform 140ms ease, filter 140ms ease, box-shadow 140ms ease;
}

.title-menu__button:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.title-menu__button:active {
  transform: translateY(2px);
}

.title-menu__story {
  margin-top: 1rem;
}

.title-menu__eyebrow {
  margin: 0;
  color: #f8e7a0;
  font-size: 0.64rem;
  line-height: 1.4;
  text-transform: uppercase;
}

.title-menu__story h1 {
  margin: 0.36rem 0 0;
  color: #ffffff;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.4;
}

.title-menu__story > p:not(.title-menu__eyebrow) {
  margin: 0.55rem 0 0;
  color: rgba(255, 248, 222, 0.78);
  font-size: 0.86rem;
  line-height: 1.55;
}

.title-wallet {
  display: grid;
  gap: 0.45rem;
}

.title-start-mode {
  background: rgba(15, 23, 42, 0.56);
  border: 1px solid rgba(255, 248, 222, 0.14);
  border-radius: 0.65rem;
  display: grid;
  gap: 0.25rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0.25rem;
}

.title-start-mode button {
  border-radius: 0.45rem;
  color: rgba(255, 248, 222, 0.7);
  font-size: 0.68rem;
  line-height: 1;
  padding: 0.5rem 0.45rem;
}

.title-start-mode__button--active {
  background: rgba(251, 191, 36, 0.22);
  color: #fff7df !important;
}

.title-menu__button:disabled {
  cursor: not-allowed;
  filter: grayscale(0.45);
  opacity: 0.55;
}

.title-actions {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

.title-menu__button--primary {
  min-height: 3.35rem;
  border: 2px solid rgba(96, 51, 15, 0.56);
  background:
    linear-gradient(180deg, rgba(255, 247, 185, 0.95) 0%, rgba(226, 176, 70, 0.98) 48%, rgba(143, 84, 26, 0.98) 100%);
  color: #2f1609;
  font-size: 1.08rem;
  text-transform: uppercase;
  box-shadow:
    0 5px 0 rgba(66, 32, 12, 0.9),
    0 16px 24px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.34);
}

.title-menu__button--primary:hover {
  box-shadow:
    0 8px 0 rgba(66, 32, 12, 0.9),
    0 22px 28px rgba(0, 0, 0, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.38);
}

.title-menu__button--primary:active {
  box-shadow:
    0 3px 0 rgba(66, 32, 12, 0.9),
    0 12px 18px rgba(0, 0, 0, 0.24);
}

.title-menu__button--wallet {
  min-height: 2.65rem;
  border: 1px solid rgba(248, 231, 160, 0.32);
  background:
    linear-gradient(180deg, rgba(34, 63, 69, 0.9), rgba(15, 31, 35, 0.95));
  color: #fff3d2;
  font-size: 0.78rem;
  text-transform: none;
  box-shadow:
    0 3px 0 rgba(2, 8, 10, 0.7),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.title-menu__button--spectator {
  min-height: 2.75rem;
  border: 1px solid rgba(151, 202, 255, 0.3);
  background:
    linear-gradient(180deg, rgba(116, 155, 169, 0.22), rgba(24, 54, 64, 0.42));
  color: #cfeaff;
  font-size: 0.82rem;
  text-transform: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.title-menu__button--spectator:hover {
  border-color: rgba(151, 202, 255, 0.52);
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.title-actions__hint {
  text-align: center;
}

.title-wallet__connected {
  align-items: center;
  background: rgba(15, 23, 42, 0.64);
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 0.65rem;
  color: #fde68a;
  display: flex;
  font-size: 0.72rem;
  justify-content: space-between;
  padding: 0.55rem 0.65rem;
}

.title-wallet__connected button {
  color: rgba(255, 248, 222, 0.74);
  font-size: 0.66rem;
}

.title-wallet__notice,
.title-wallet__error {
  color: #fca5a5;
  font-size: 0.68rem;
  line-height: 1.25;
  margin: 0;
}

.title-wallet__notice {
  color: rgba(255, 248, 222, 0.74);
}

.title-loopers {
  display: grid;
  gap: 0.5rem;
}

.title-loopers__label,
.title-loopers__status {
  color: rgba(255, 248, 222, 0.74);
  font-size: 0.68rem;
  margin: 0;
}

.title-loopers__grid {
  display: grid;
  gap: 0.55rem;
  grid-template-columns: repeat(auto-fit, minmax(5.7rem, 1fr));
  max-height: 13.5rem;
  overflow-y: auto;
  padding: 0.15rem 0.25rem 0.2rem 0.05rem;
}

.title-loopers__grid--default {
  grid-template-columns: repeat(auto-fit, minmax(6.6rem, 1fr));
}

.title-looper {
  align-items: center;
  background:
    radial-gradient(circle at 50% 34%, rgba(248, 231, 160, 0.1), transparent 42%),
    rgba(12, 27, 30, 0.82);
  border: 1px solid rgba(255, 248, 222, 0.18);
  border-radius: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  justify-content: center;
  min-height: 6.55rem;
  overflow: hidden;
  padding: 0.55rem 0.35rem 0.45rem;
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
}

.title-looper:not(.title-default-hero) {
  min-height: 6.1rem;
  padding: 0;
}

.title-looper:hover {
  background:
    radial-gradient(circle at 50% 34%, rgba(248, 231, 160, 0.18), transparent 44%),
    rgba(15, 34, 37, 0.9);
  border-color: rgba(248, 231, 160, 0.34);
  transform: translateY(-1px);
}

.title-looper--selected {
  background:
    radial-gradient(circle at 50% 34%, rgba(251, 191, 36, 0.24), transparent 46%),
    rgba(76, 65, 24, 0.78);
  border-color: rgba(251, 191, 36, 0.84);
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.18), inset 0 1px 0 rgba(255, 248, 222, 0.16);
}

.title-default-hero {
  min-height: 6.45rem;
  padding: 0.55rem 0.45rem;
}

.title-looper__sprite {
  align-items: center;
  display: flex;
  flex: 0 0 3.25rem;
  height: 3.25rem;
  justify-content: center;
  width: 3.25rem;
}

.title-looper__name,
.title-looper__role {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-looper__name {
  color: rgba(255, 248, 222, 0.78);
  font-size: 0.64rem;
  font-weight: 800;
  line-height: 1;
}

.title-looper__role {
  color: rgba(248, 231, 160, 0.55);
  font-size: 0.54rem;
  line-height: 1;
  text-transform: uppercase;
}

@media (max-width: 900px) {
  .title-screen__shade {
    background:
      radial-gradient(circle at 50% 34%, rgba(251, 191, 36, 0.14), transparent 38%),
      linear-gradient(0deg, rgba(4, 14, 19, 0.92) 0%, rgba(4, 14, 19, 0.74) 34%, rgba(4, 14, 19, 0.18) 72%),
      linear-gradient(90deg, rgba(4, 14, 19, 0.48) 0%, rgba(4, 14, 19, 0.08) 55%, rgba(4, 14, 19, 0.42) 100%);
  }

  .title-screen__content {
    align-items: center;
    justify-content: center;
    overflow-y: auto;
  }
}

@media (max-width: 640px) {
  .title-screen__content {
    padding: 0.85rem;
  }

  .title-menu__logo {
    max-width: 17rem;
  }
}

</style>

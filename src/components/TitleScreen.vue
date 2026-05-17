<template>
  <div class="title-screen">
    <TitleBackground :move="true" :blur="10" />
    <div class="title-screen__shade" aria-hidden="true" />
    <div class="title-screen__texture" aria-hidden="true" />
    <div class="title-art-card" aria-hidden="true">
      <img :src="titleScreenArt" alt="" />
    </div>
    <section class="title-story-scroll" aria-label="Introduction story">
      <div class="title-story-scroll__track">
        <p v-for="paragraph in introStoryParagraphs" :key="paragraph">{{ paragraph }}</p>
      </div>
    </section>

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
            <p v-if="walletError" class="title-wallet__error">{{ walletError }}</p>
          </div>

          <div v-if="startMode === 'wallet' && walletSession && !existingWalletSettlementId" class="title-loopers" aria-label="Choose two Looper avatars">
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

          <div v-if="startMode === 'default'" class="title-loopers" aria-label="Choose two default heroes">
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

          <button class="title-menu__button" type="submit" :disabled="!canStart">{{ primaryActionLabel }}</button>
        </form>

        <div class="title-menu__story">
          <p class="title-menu__eyebrow">Current Story</p>
          <h1>{{ previewStory.title }}</h1>
          <p>{{ currentRun ? previewStory.guidance : previewStory.briefing }}</p>
        </div>
      </section>

      <aside class="title-briefing" aria-label="Colony status">
        <section class="title-card">
          <p class="title-card__label">Next Unlock</p>
          <h2>{{ nextMilestoneLabel }}</h2>
          <p>{{ nextMilestoneDescription }}</p>
        </section>

        <section class="title-card">
          <p class="title-card__label">Colony Pressure</p>
          <h2>{{ colonyPressure }}</h2>
          <p>{{ previewStory.kicker }}</p>
        </section>

        <section class="title-card title-card--crew">
          <div class="title-card__heading">
            <div>
              <p class="title-card__label">Landing Crew</p>
              <h2>{{ crewHeading }}</h2>
            </div>
            <span>{{ crew.length }} crew</span>
          </div>

          <div class="title-crew">
            <article v-for="member in crew" :key="member.name" class="title-crew__member">
              <div class="title-crew__avatar">
                <Sprite
                  :sprite="member.avatar"
                  :zoom="1"
                  :row="8"
                  :frame="0"
                  :size="32"
                  :aria-label="member.name"
                />
              </div>
              <div class="title-crew__copy">
                <p>{{ member.name }}</p>
                <span>{{ member.role }}</span>
              </div>
            </article>
          </div>

          <p class="title-card__hint">{{ crewHint }}</p>
        </section>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from '@reown/appkit/vue';
import type { ProviderType } from '@reown/appkit-adapter-ethers';
import TitleBackground from './TitleBackground.vue';
import Sprite from './Sprite.vue';
import { resumeGame } from '../store/uiStore.ts';
import { runSnapshot } from '../store/runStore.ts';
import { musicManager } from '../core/musicManager.ts';
import { connectWithNickname, getStoredPlayerName } from '../core/socket.ts';
import {
  buildLooperlandsContinueAuth,
  buildLooperlandsJoinAuth,
  clearStoredLooperlandsSession,
  connectLooperlandsWallet,
  fetchDriftlandsWalletSettlement,
  fetchLooperlandsLoopers,
  getStoredLooperlandsSession,
  type EthereumProvider,
  type LooperlandsWalletSession,
} from '../core/looperlandsClient.ts';
import { initializeWalletConnectAppKit } from '../core/walletConnect.ts';
import { createStoryProgression } from '../shared/story/progression.ts';
import { getStoryHeroTemplate, listStoryHeroTemplates, type StoryHeroId } from '../shared/story/heroRoster.ts';
import type { LooperlandsHeroSelection } from '../shared/looperlands.ts';
import logoArt from '../assets/ui/logo.png';
import titleScreenArt from '../assets/ui/title-screen-art.jpg';
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

const openingProgression = createStoryProgression(1);
const introStoryParagraphs = [
  'They crossed the old sea because the old maps had run out of room. Behind them were crowded ports, tired fields, and promises too small for the people asked to keep them. Ahead lay the Driftlands, a chain of green islands rising from the morning haze, bright with timber, stone, clean water, and questions no council had managed to answer.',
  'The heroes were not sent as conquerors. They came as the first steady hands: builders, scouts, harvesters, and keepers of the campfire when the wind turned cold. Each carried a reason for leaving, but they shared one charge. Find a place where a frontier could become a home, and make it last long enough for others to follow.',
  'Frontier into New World became more than a banner on a ship. It was a wager that courage could be practical. Raise shelter before the first storm. Cut roads through wild ground. Turn scattered supplies into workshops, granaries, wells, and stories worth telling by lantern light.',
  'What is expected is simple to say and difficult to do: grow. Feed the landing. House the crew. Learn the land without breaking it. Build each new chain of work so the next one can begin. The Driftlands will not hand over a future, but with patience, brave choices, and enough stubborn hope, the heroes can carve one out tile by tile.',
];
const avatarByKey: Record<string, string> = {
  boy: boyAvatar,
  girl: girlAvatar,
  loophead: loopheadAvatar,
  mossling: mosslingAvatar,
  santa: santaAvatar,
};
const storyHeroCount = listStoryHeroTemplates().length;
const walletConnectEnabled = initializeWalletConnectAppKit();
const appKit = walletConnectEnabled ? useAppKit() : null;
const appKitAccount = walletConnectEnabled ? useAppKitAccount({ namespace: 'eip155' }) : null;
const appKitProvider = walletConnectEnabled ? useAppKitProvider<ProviderType>('eip155') : null;
const appKitDisconnect = walletConnectEnabled ? useDisconnect() : null;

const currentRun = computed(() => runSnapshot.value);
const nickname = ref(getStoredPlayerName());
const walletSession = ref<LooperlandsWalletSession | null>(getStoredLooperlandsSession());
const startMode = ref<'wallet' | 'default'>(walletSession.value ? 'wallet' : 'default');
const walletLoading = ref(false);
const walletError = ref('');
const walletSettlementLoading = ref(false);
const existingWalletSettlementId = ref<string | null>(null);
const looperLoading = ref(false);
const loopers = ref<LooperlandsHeroSelection[]>([]);
const selectedLooperIds = ref<string[]>([]);
const selectedDefaultHeroIds = ref<StoryHeroId[]>(['h2', 'h3']);
const previewStory = computed(() => currentRun.value?.chapter ?? openingStory);
const currentProgression = computed(() => currentRun.value?.progression ?? openingProgression);
const nextMilestone = computed(() => {
  const nextNodeKey = currentProgression.value.nextRecommendedNodeKeys[0];
  return currentProgression.value.nodes.find((node) => node.key === nextNodeKey) ?? null;
});
const crew = computed(() => currentProgression.value.heroes.available
  .map((heroId) => getStoryHeroTemplate(heroId))
  .filter((hero): hero is NonNullable<ReturnType<typeof getStoryHeroTemplate>> => !!hero)
  .map((hero) => ({
    name: hero.name,
    role: hero.role,
    avatar: avatarByKey[hero.avatar] ?? santaAvatar,
  })));
const defaultHeroes = computed(() => listStoryHeroTemplates().map((hero) => ({
  ...hero,
  avatar: avatarByKey[hero.avatar] ?? santaAvatar,
})));
const primaryActionLabel = computed(() => {
  if (startMode.value === 'wallet' && existingWalletSettlementId.value) {
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
    return selectedDefaultHeroes.value.length === 2;
  }

  if (!walletSession.value || walletLoading.value || walletSettlementLoading.value || looperLoading.value) {
    return false;
  }

  if (existingWalletSettlementId.value) {
    return true;
  }

  return selectedLoopers.value.length === 2;
});
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
const nextMilestoneLabel = computed(() => nextMilestone.value?.label ?? 'Keep Expanding');
const nextMilestoneDescription = computed(() => nextMilestone.value?.description ?? 'Build another useful production link and the next milestone will appear.');
const crewHeading = computed(() => `${crew.value.length} hero${crew.value.length === 1 ? '' : 'es'} on the center stone`);
const colonyPressure = computed(() => {
  if (!currentRun.value) {
    return 'Housing, food, and labor are all still fragile.';
  }

  const run = currentRun.value;
  return `${run.activeTiles} active tiles, ${run.discoveredTiles} explored, ${run.progression.unlocked.heroes.length} hero${run.progression.unlocked.heroes.length === 1 ? '' : 'es'} available.`;
});
const crewHint = computed(() => {
  const lockedCount = storyHeroCount - crew.value.length;

  if (lockedCount > 0) {
    return `${lockedCount} more recruit${lockedCount === 1 ? '' : 's'} join once the colony can support more beds, more jobs, and stronger supply lines.`;
  }

  return 'Every recruit is already in the field now, so further growth comes from deeper production chains and upgraded infrastructure.';
});

onMounted(() => {
  musicManager.initialize();
  if (walletSession.value) {
    void prepareWalletStart();
  }

  window.addEventListener('pointerdown', retryTitleMusic, { once: true });
  window.addEventListener('keydown', retryTitleMusic, { once: true });
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

function isEthereumProvider(provider: unknown): provider is EthereumProvider {
  return !!provider && typeof (provider as EthereumProvider).request === 'function';
}

async function connectAppKitProvider(): Promise<EthereumProvider | undefined> {
  if (!walletConnectEnabled || !appKit || !appKitAccount || !appKitProvider) {
    return undefined;
  }

  if (!appKitAccount.value.isConnected || !isEthereumProvider(appKitProvider.walletProvider)) {
    await appKit.open({ view: 'Connect', namespace: 'eip155' });
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 120000) {
    const provider = appKitProvider.walletProvider;
    if (appKitAccount.value.isConnected && isEthereumProvider(provider)) {
      return provider;
    }

    await delay(150);
  }

  throw new Error('WalletConnect connection was not completed.');
}

async function connectWallet() {
  walletLoading.value = true;
  walletError.value = '';
  try {
    const provider = await connectAppKitProvider();
    walletSession.value = await connectLooperlandsWallet(provider);
    selectedLooperIds.value = [];
    existingWalletSettlementId.value = null;
    await prepareWalletStart();
  } catch (error) {
    walletError.value = error instanceof Error ? error.message : 'Could not connect wallet.';
  } finally {
    walletLoading.value = false;
  }
}

function disconnectWallet() {
  clearStoredLooperlandsSession();
  if (appKitDisconnect) {
    void appKitDisconnect.disconnect({ namespace: 'eip155' }).catch((error) => {
      console.warn('Failed to disconnect WalletConnect session:', error);
    });
  }
  walletSession.value = null;
  existingWalletSettlementId.value = null;
  loopers.value = [];
  selectedLooperIds.value = [];
  walletError.value = '';
}

async function prepareWalletStart() {
  if (!walletSession.value) {
    return;
  }

  await refreshExistingWalletSettlement();
  if (!existingWalletSettlementId.value) {
    await loadLoopers();
  } else {
    loopers.value = [];
    selectedLooperIds.value = [];
  }
}

async function refreshExistingWalletSettlement() {
  if (!walletSession.value) {
    existingWalletSettlementId.value = null;
    return;
  }

  walletSettlementLoading.value = true;
  walletError.value = '';
  try {
    existingWalletSettlementId.value = await fetchDriftlandsWalletSettlement(walletSession.value);
  } catch (error) {
    existingWalletSettlementId.value = null;
    walletError.value = error instanceof Error ? error.message : 'Could not check this wallet colony.';
  } finally {
    walletSettlementLoading.value = false;
  }
}

async function loadLoopers() {
  if (!walletSession.value) {
    return;
  }

  looperLoading.value = true;
  walletError.value = '';
  try {
    loopers.value = await fetchLooperlandsLoopers(walletSession.value);
    selectedLooperIds.value = selectedLooperIds.value.filter((id) => loopers.value.some((looper) => looper.id === id));
  } catch (error) {
    walletError.value = error instanceof Error ? error.message : 'Could not load Looper avatars.';
  } finally {
    looperLoading.value = false;
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

  if (selectedLoopers.value.length !== 2) {
    walletError.value = 'Choose two Looper avatars first.';
    return;
  }

  connectWithNickname(nickname.value, buildLooperlandsJoinAuth(walletSession.value, selectedLoopers.value));
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

.title-art-card {
  position: absolute;
  left: clamp(1rem, 4vw, 4.5rem);
  top: 80%;
  width: min(21vw, 18rem);
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border: 1px solid rgba(255, 244, 202, 0.28);
  border-radius: 8px;
  background: rgba(9, 26, 24, 0.58);
  box-shadow: 0 24px 54px rgba(3, 10, 12, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.14);
  opacity: 0.9;
  transform: translateY(-50%) rotate(-1.4deg);
  pointer-events: none;
}

.title-art-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(5, 18, 20, 0.1), rgba(5, 18, 20, 0.42)),
    linear-gradient(90deg, rgba(255, 244, 202, 0.16), transparent 24%, transparent 76%, rgba(0, 0, 0, 0.18));
}

.title-art-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
}

.title-story-scroll {
  position: absolute;
  left: clamp(21rem, 28vw, 26rem);
  top: 80%;
  z-index: 0;
  width: min(35rem, 45vw);
  height: min(18rem, 40vh);
  overflow: hidden;
  color: rgba(255, 248, 222, 0.78);
  mask-image: linear-gradient(180deg, transparent 0%, #000 18%, #000 78%, transparent 100%);
  transform: translateY(-50%);
  pointer-events: none;
}

.title-story-scroll__track {
  animation: titleStoryCrawl 120s linear infinite;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.78);
}

.title-story-scroll p {
  margin: 0 0 1rem;
  font-size: 0.94rem;
  line-height: 1.7;
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

.title-menu,
.title-card {
  border-radius: 28px;
  background: rgba(13, 31, 31, 0.46);
  box-shadow: 0 20px 46px rgba(3, 10, 12, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.12), 2px 3px 25px rgba(3, 10, 12, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(25px) saturate(158%) sepia(0.12);
}

.title-menu {
  background: rgba(8, 27, 22, 0.68);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: clamp(1rem, 2vw, 1.35rem);
  text-align: center;
  width: min(36rem, 100%);
}

.title-menu__logo {
  height: auto;
  margin: 1rem auto;
  max-height: 7.5rem;
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.45));
}

.title-menu__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 1rem;
  font-size: 0.62rem;
  line-height: 1;
  text-transform: uppercase;
  color: #f8e7a0;
}

.title-menu__meta span,
.title-card__heading span {
  border: 1px solid rgba(248, 231, 160, 0.28);
  border-radius: 999px;
  background: rgba(2, 8, 10, 0.34);
  padding: 0.42rem 0.56rem;
}

.title-menu__account {
  display: grid;
  gap: 0.65rem;
  margin-top: 1rem;
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
  min-height: 4rem;
  margin-top: 0.25rem;
  border: 2px solid #60330f55;
  border-radius: 16px;
  background: linear-gradient(180deg, #e8d966 0%, #dda845 53%, #9c5d1e 100%);
  color: #2f1609;
  font-size: 1.15rem;
  font-weight: 800;
  text-transform: uppercase;
  box-shadow: 0 6px 0 rgba(66, 32, 12, 0.86), 0 18px 24px rgba(0, 0, 0, 0.18);
  transition: transform 140ms ease, filter 140ms ease, box-shadow 140ms ease;
}

.title-menu__button:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
  box-shadow: 0 9px 0 rgba(66, 32, 12, 0.86), 0 22px 28px rgba(0, 0, 0, 0.3);
}

.title-menu__button:active {
  transform: translateY(4px);
  box-shadow: 0 4px 0 rgba(66, 32, 12, 0.86), 0 12px 20px rgba(0, 0, 0, 0.22);
}

.title-menu__story {
  margin-top: 1.35rem;
}

.title-menu__eyebrow,
.title-card__label {
  margin: 0;
  color: #f8e7a0;
  font-size: 0.64rem;
  line-height: 1.4;
  text-transform: uppercase;
}

.title-menu__story h1,
.title-card h2 {
  margin: 0.36rem 0 0;
  color: #ffffff;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.4;
}

.title-menu__story > p:not(.title-menu__eyebrow),
.title-card > p:not(.title-card__label) {
  margin: 0.55rem 0 0;
  color: rgba(255, 248, 222, 0.78);
  font-size: 0.86rem;
  line-height: 1.55;
}

.title-briefing {
  position: absolute;
  right: clamp(1rem, 2.5vw, 2rem);
  bottom: clamp(1rem, 2.5vw, 2rem);
  display: grid;
  gap: 0.75rem;
  width: min(23rem, calc(100vw - 2rem));
}

.title-card {
  padding: 2rem;
}

.title-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.title-card__heading span {
  flex: 0 0 auto;
  color: #f8e7a0;
  font-size: 0.62rem;
  line-height: 1.4;
  text-transform: uppercase;
}

.title-crew {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.title-crew__member {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 0.55rem;
  border: 1px solid rgba(255, 244, 202, 0.16);
  border-radius: 8px;
  background: rgba(2, 8, 10, 0.34);
  padding: 0.45rem;
}

.title-crew__avatar {
  display: flex;
  flex: 0 0 3rem;
  width: 3rem;
  height: 3rem;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(5, 18, 20, 0.76);
}

.title-crew__copy {
  min-width: 0;
}

.title-crew__copy p {
  margin: 0;
  overflow: hidden;
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-crew__copy span {
  display: block;
  margin-top: 0.22rem;
  overflow: hidden;
  color: rgba(255, 248, 222, 0.58);
  font-size: 0.6rem;
  line-height: 1.1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.title-card > .title-card__hint {
  margin-top: 0.75rem;
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

.title-menu__button--wallet {
  background: linear-gradient(180deg, #2563eb, #1d4ed8);
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
  grid-template-columns: repeat(auto-fit, minmax(8.4rem, 1fr));
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
  min-height: 7.75rem;
  padding: 0.7rem 0.55rem;
}

.title-looper__sprite {
  align-items: center;
  display: flex;
  flex: 0 0 4rem;
  height: 4rem;
  justify-content: center;
  width: 4rem;
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

@media (max-width: 1420px) {
  .title-briefing {
    display: none;
  }
}

@media (max-width: 1100px) {
  .title-art-card,
  .title-story-scroll {
    display: none;
  }
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

  .title-briefing {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .title-story-scroll__track {
    animation: none;
  }
}

@keyframes titleStoryCrawl {
  0% {
    opacity: 1;
    transform: translateY(18%);
  }

  4% {
    opacity: 1;
  }

  92% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateY(-100%);
  }
}
</style>

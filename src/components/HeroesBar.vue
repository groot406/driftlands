<template>
  <div class="heroes-bar pointer-events-none overflow-hidden">
    <div ref="stripRef" class="heroes-avatar-strip pointer-events-none overflow-hidden">
      <template v-if="heroes.length">
        <template
          v-for="(hero, index) in heroes"
          :key="hero.id"
          :data-hero-id="hero.id"
          :aria-current="selectedHeroId === hero.id ? 'true' : undefined"
        >
          <div v-if="hero.playerId === currentPlayerId" class="hero-card pointer-events-auto"
               :class="cardClass(hero.id)"
               @click="select(hero)"
               :style="cardStyle(index)">
            <div class="hero-card-shine" aria-hidden="true"></div>
            <div class="hero-card-header">
              <span class="hero-card-name">
                {{ hero.name }}
              </span>
<!--              <div class="hero-card-actions">-->
<!--                <span class="hero-status-pill" :class="statusClass(hero.id)">-->
<!--                  {{ heroStatus(hero.id) }}-->
<!--                </span>-->
<!--                <button-->
<!--                  v-if="canClaim(hero.id)"-->
<!--                  class="hero-action-pill hero-action-pill-claim"-->
<!--                  @click.stop="claim(hero.id)"-->
<!--                >-->
<!--                  Claim-->
<!--                </button>-->
<!--                <button-->
<!--                  v-else-if="isMine(hero.id)"-->
<!--                  class="hero-action-pill hero-action-pill-release"-->
<!--                  @click.stop="release(hero.id)"-->
<!--                >-->
<!--                  Release-->
<!--                </button>-->
<!--              </div>-->
            </div>

            <div class="hero-card-portrait">
              <div class="hero-card-portrait-frame">
                <div class="hero-card-sprite">
                  <Sprite :sprite="'src/assets/heroes/' + hero.avatar + '.png'" :zoom="2" :row="8" :size="32" :frames="2" :speed="450" />
                </div>
              </div>
              <div class="hero-card-xp">
                <span>XP</span>
                <strong>{{ hero.stats.xp }}</strong>
              </div>
            </div>

            <div class="hero-card-controls" :class="{ 'hero-card-controls-visible': showHeroControls(hero) }">
              <div class="scout-controls" :class="{ 'scout-controls-open': isScoutMenuOpen(hero) }" @click.stop>
                <button
                  type="button"
                  class="scout-menu-trigger"
                  :class="{ 'scout-menu-trigger-active': !!hero.scoutResourceIntent }"
                  :style="{ '--scout-color': getActiveScoutOption(hero)?.color ?? '#e2e8f0' }"
                  :title="scoutTriggerTitle(hero)"
                  :aria-label="scoutTriggerTitle(hero)"
                  :aria-expanded="isScoutMenuOpen(hero)"
                  :disabled="!showScoutControls(hero) || !!hero.carryingPayload"
                  @pointerdown.stop
                  @click.stop="toggleScoutMenu(hero, $event)"
                >
                  <span class="scout-trigger-icon" aria-hidden="true">
                    <span class="scout-trigger-dot"></span>
                    <span class="scout-trigger-sweep"></span>
                  </span>
                  <span class="scout-trigger-copy">
                    <span class="scout-trigger-kicker">Scout</span>
                    <span class="scout-trigger-label">{{ getActiveScoutOption(hero)?.label ?? 'Choose' }}</span>
                  </span>
                  <span class="scout-trigger-caret" aria-hidden="true"></span>
                </button>
              </div>

              <div class="skill-controls" :class="{ 'skill-controls-open': isSkillMenuOpen(hero) }" @click.stop>
                <button
                  type="button"
                  class="skill-menu-trigger"
                  :class="{ 'skill-menu-trigger-ready': getHeroSkillPoints(hero) > 0 }"
                  :title="skillTriggerTitle(hero)"
                  :aria-label="skillTriggerTitle(hero)"
                  :aria-expanded="isSkillMenuOpen(hero)"
                  :disabled="!showSkillControls(hero)"
                  @pointerdown.stop
                  @click.stop="toggleSkillMenu(hero, $event)"
                >
                  <span class="skill-trigger-code" aria-hidden="true">+</span>
                  <span class="skill-trigger-copy">
                    <span class="skill-trigger-kicker">Skills</span>
                    <span class="skill-trigger-label">{{ hero.skillPoints ?? 0 }} · {{ getSkillProgressLabel(hero) }}</span>
                  </span>
                  <span class="skill-trigger-caret" aria-hidden="true"></span>
                </button>
              </div>
            </div>
          </div>
        </template>
      </template>
      <div v-else class="text-xs opacity-70 px-2 py-1">No heroes recruited yet.</div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="floatingMenu?.kind === 'scout' && activeFloatingHero"
      class="hero-floating-menu scout-menu"
      :style="floatingMenuStyle"
      role="menu"
      @click.stop
      @pointerdown.stop
    >
      <button
        v-for="option in scoutOptions"
        :key="option.type"
        type="button"
        class="scout-option"
        :class="{ 'scout-option-active': activeFloatingHero.scoutResourceIntent?.resourceType === option.type }"
        :style="{ '--scout-color': option.color }"
        :title="scoutOptionTitle(activeFloatingHero, option)"
        :aria-label="scoutOptionTitle(activeFloatingHero, option)"
        :disabled="!canSelectScoutOption(activeFloatingHero, option)"
        role="menuitem"
        @click.stop="scout(activeFloatingHero, option)"
      >
        <span class="scout-option-mark" aria-hidden="true"></span>
        <span class="scout-option-copy">
          <span class="scout-option-label">{{ option.label }}</span>
          <span class="scout-option-summary">{{ option.unlocked ? option.summary : option.lockedLabel }}</span>
        </span>
        <span v-if="activeFloatingHero.scoutResourceIntent?.resourceType === option.type" class="scout-option-state">Active</span>
        <span v-else-if="!option.unlocked" class="scout-option-state scout-option-state-locked">Locked</span>
      </button>
    </div>

    <div
      v-if="floatingMenu?.kind === 'skill' && activeFloatingHero"
      class="hero-floating-menu skill-menu"
      :style="floatingMenuStyle"
      role="menu"
      @click.stop
      @pointerdown.stop
    >
      <button
        v-for="skill in heroSkillOptions"
        :key="skill.key"
        type="button"
        class="skill-option"
        :disabled="!canSelectSkill(activeFloatingHero, skill.key)"
        :title="skillTitle(activeFloatingHero, skill)"
        :aria-label="skillTitle(activeFloatingHero, skill)"
        role="menuitem"
        @click.stop="selectSkill(activeFloatingHero, skill.key)"
      >
        <span class="skill-option-code">{{ skill.code }}</span>
        <span class="skill-option-copy">
          <span class="skill-option-topline">
            <span class="skill-option-label">{{ skill.label }}</span>
            <span class="skill-option-level">Lv {{ getSkillLevel(activeFloatingHero, skill.key) }}/{{ skill.maxLevel }}</span>
          </span>
          <span class="skill-option-summary">{{ skill.menuSummary }}</span>
          <span class="skill-option-effects">
            <span
              v-for="effect in skill.effects"
              :key="effect.level"
              class="skill-option-effect"
              :class="{
                'skill-option-effect-active': getSkillLevel(activeFloatingHero, skill.key) >= effect.level,
                'skill-option-effect-next': isNextSkillEffect(activeFloatingHero, skill.key, effect.level),
              }"
            >
              {{ effect.text }}
            </span>
          </span>
        </span>
        <span class="skill-option-state">{{ skillStateLabel(activeFloatingHero, skill.key, skill.maxLevel) }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Sprite from './Sprite.vue';
import { requestHeroClaim, requestHeroRelease } from '../core/coopService';
import { currentPlayerId } from '../core/socket';
import type { Hero } from '../core/types/Hero.ts';
import type { ScoutTargetType } from '../core/types/Scout.ts';
import { requestHeroScoutResource, requestHeroSkillSelect } from '../core/heroService.ts';
import { SCOUT_TARGET_DEFINITIONS } from '../shared/game/scoutResources.ts';
import {
  HERO_SKILL_DEFINITIONS,
  getHeroSkillLevel,
  getHeroSkillPoints,
  type HeroSkillKey,
} from '../shared/heroes/heroSkills.ts';
import { HERO_ABILITY_CHARGE_PROGRESS_REQUIRED } from '../shared/heroes/heroAbilities.ts';
import { heroes } from '../store/heroStore';
import {
  canControlHero,
  getHeroOwnerName,
  isHeroClaimedByCurrentPlayer,
  isHeroClaimedByOtherPlayer,
} from '../store/playerStore';
import { runSnapshot } from '../store/runStore.ts';
import { selectedHeroId, selectHero } from '../store/uiStore';

const scoutResourceColors: Record<ScoutTargetType, string> = {
  wood: '#79d47c',
  water: '#70d6ff',
  stone: '#b9b3a1',
  ore: '#9aa6c7',
  sand: '#e7c979',
  snow: '#dbeafe',
};

interface ScoutOption {
  type: ScoutTargetType;
  label: string;
  summary: string;
  lockedLabel: string;
  color: string;
  unlocked: boolean;
}

type FloatingMenuKind = 'scout' | 'skill';

interface FloatingMenuState {
  kind: FloatingMenuKind;
  heroId: string;
  left: number;
  bottom: number;
  width: number;
}

const FLOATING_MENU_WIDTHS: Record<FloatingMenuKind, number> = {
  scout: 248,
  skill: 432,
};

const openScoutMenuHeroId = ref<string | null>(null);
const openSkillMenuHeroId = ref<string | null>(null);
const floatingMenu = ref<FloatingMenuState | null>(null);
const stripRef = ref<HTMLElement | null>(null);

const scoutOptions = computed<ScoutOption[]>(() => SCOUT_TARGET_DEFINITIONS.map((definition) => ({
  type: definition.type,
  label: definition.label,
  summary: definition.summary,
  lockedLabel: `Unlock ${definition.label}`,
  color: scoutResourceColors[definition.type],
  unlocked: isScoutDefinitionUnlocked(definition),
})));

const skillCodes: Record<HeroSkillKey, string> = {
  production_boost: '+',
  task_rush: '>>',
  stabilizing_method: '||',
  survey_method: '?',
};

interface SkillEffect {
  level: number;
  text: string;
}

interface SkillMenuHelp {
  menuSummary: string;
  effects: readonly SkillEffect[];
}

const skillMenuHelp: Record<HeroSkillKey, SkillMenuHelp> = {
  production_boost: {
    menuSummary: 'Improves the Boost ability for staffed production buildings.',
    effects: [
      { level: 1, text: 'L1: 1.75x output' },
      { level: 2, text: 'L2: lasts 2 cycles' },
      { level: 3, text: 'L3: -1 input cost' },
    ],
  },
  task_rush: {
    menuSummary: 'Improves the Rush ability for pushing active tasks forward.',
    effects: [
      { level: 1, text: 'L1: +25% rush' },
      { level: 2, text: 'L2: +50% rush' },
      { level: 3, text: 'L3: refunds on finish' },
    ],
  },
  stabilizing_method: {
    menuSummary: 'Improves the Hold ability for stabilizing unstable tiles.',
    effects: [
      { level: 1, text: 'L1: hold 3 min' },
      { level: 2, text: 'L2: hold 4 min' },
      { level: 3, text: 'L3: repairs tile' },
    ],
  },
  survey_method: {
    menuSummary: 'Improves the Survey ability. Explore speed comes from SPD, not skills.',
    effects: [
      { level: 1, text: 'L1: no speed change' },
      { level: 2, text: 'L2: adjacent reveal' },
      { level: 3, text: 'L3: refunds empty survey' },
    ],
  },
};

const heroSkillOptions = HERO_SKILL_DEFINITIONS.map((skill) => ({
  ...skill,
  code: skillCodes[skill.key],
  ...skillMenuHelp[skill.key],
}));

const activeFloatingHero = computed(() => (
  floatingMenu.value
    ? (heroes.find((hero) => hero.id === floatingMenu.value?.heroId) ?? null)
    : null
));

const floatingMenuStyle = computed(() => {
  const menu = floatingMenu.value;
  if (!menu) {
    return {};
  }

  return {
    left: `${menu.left}px`,
    bottom: `${menu.bottom}px`,
    width: `${menu.width}px`,
  };
});

function closeFloatingMenus() {
  openScoutMenuHeroId.value = null;
  openSkillMenuHeroId.value = null;
  floatingMenu.value = null;
}

function positionFloatingMenu(kind: FloatingMenuKind, heroId: string, target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    closeFloatingMenus();
    return;
  }

  const rect = target.getBoundingClientRect();
  const width = Math.min(FLOATING_MENU_WIDTHS[kind], Math.max(220, window.innerWidth - 16));
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const bottom = Math.max(8, window.innerHeight - rect.top + 6);
  floatingMenu.value = { kind, heroId, left, bottom, width };
}

function select(hero: Hero) {
  closeFloatingMenus();
  if (!isHeroClaimedByOtherPlayer(hero.id, currentPlayerId.value) && !isMine(hero.id)) {
    requestHeroClaim(hero.id);
  }

  selectHero(hero, false);
}

function claim(heroId: string) {
  requestHeroClaim(heroId);
}

function release(heroId: string) {
  requestHeroRelease(heroId);
}

function scout(hero: Hero, option: ScoutOption) {
  if (!canSelectScoutOption(hero, option)) {
    return;
  }

  requestHeroScoutResource(hero.id, option.type);
  closeFloatingMenus();
}

function showScoutControls(hero: Hero) {
  return selectedHeroId.value === hero.id && canControlHero(hero.id, currentPlayerId.value);
}

function isScoutDefinitionUnlocked(definition: typeof SCOUT_TARGET_DEFINITIONS[number]) {
  const unlockedTerrains = runSnapshot.value?.progression.unlocked.terrains;
  return unlockedTerrains?.includes(definition.unlockTerrain) ?? ['forest', 'water'].includes(definition.unlockTerrain);
}

function isScoutMenuOpen(hero: Hero) {
  return openScoutMenuHeroId.value === hero.id;
}

function toggleScoutMenu(hero: Hero, event: MouseEvent) {
  if (!showScoutControls(hero) || hero.carryingPayload) {
    return;
  }

  if (isScoutMenuOpen(hero)) {
    closeFloatingMenus();
    return;
  }

  openScoutMenuHeroId.value = hero.id;
  openSkillMenuHeroId.value = null;
  positionFloatingMenu('scout', hero.id, event.currentTarget);
}

function getActiveScoutOption(hero: Hero) {
  return scoutOptions.value.find((option) => option.type === hero.scoutResourceIntent?.resourceType) ?? null;
}

function canSelectScoutOption(hero: Hero, option: ScoutOption) {
  return showScoutControls(hero) && !hero.carryingPayload && option.unlocked;
}

function showSkillControls(hero: Hero) {
  return selectedHeroId.value === hero.id && canControlHero(hero.id, currentPlayerId.value);
}

function showHeroControls(hero: Hero) {
  return showScoutControls(hero) || showSkillControls(hero);
}

function isSkillMenuOpen(hero: Hero) {
  return openSkillMenuHeroId.value === hero.id;
}

function toggleSkillMenu(hero: Hero, event: MouseEvent) {
  if (!showSkillControls(hero)) {
    return;
  }

  if (isSkillMenuOpen(hero)) {
    closeFloatingMenus();
    return;
  }

  openSkillMenuHeroId.value = hero.id;
  openScoutMenuHeroId.value = null;
  positionFloatingMenu('skill', hero.id, event.currentTarget);
}

function getSkillLevel(hero: Hero, skill: HeroSkillKey) {
  return getHeroSkillLevel(hero, skill);
}

function getXpChargePercent(hero: Hero) {
  return Math.max(0, Math.min(100, Math.round(((hero.xpChargeProgress ?? 0) / HERO_ABILITY_CHARGE_PROGRESS_REQUIRED) * 100)));
}

function getSkillProgressLabel(hero: Hero) {
  return getHeroSkillPoints(hero) > 0 ? 'Ready' : `XP ${getXpChargePercent(hero)}%`;
}

function canSelectSkill(hero: Hero, skill: HeroSkillKey) {
  return showSkillControls(hero) && getHeroSkillPoints(hero) > 0 && getSkillLevel(hero, skill) < 3;
}

function isNextSkillEffect(hero: Hero, skill: HeroSkillKey, effectLevel: number) {
  return canSelectSkill(hero, skill) && effectLevel === getSkillLevel(hero, skill) + 1;
}

function skillStateLabel(hero: Hero, skill: HeroSkillKey, maxLevel: number) {
  if (getSkillLevel(hero, skill) >= maxLevel) {
    return 'Max';
  }

  return getHeroSkillPoints(hero) > 0 ? 'Pick' : 'Need point';
}

function selectSkill(hero: Hero, skill: HeroSkillKey) {
  if (!canSelectSkill(hero, skill)) {
    return;
  }

  requestHeroSkillSelect(hero.id, skill);
  closeFloatingMenus();
}

function skillTitle(hero: Hero, skill: { key: HeroSkillKey; label: string; menuSummary: string; effects: readonly SkillEffect[]; maxLevel: number }) {
  const level = getSkillLevel(hero, skill.key);
  const effectSummary = skill.effects.map((effect) => effect.text).join(', ');
  if (getHeroSkillPoints(hero) <= 0) {
    return `${skill.label} ${level}/${skill.maxLevel}. ${skill.menuSummary} ${effectSummary}. ${hero.name} has no skill points.`;
  }

  if (level >= skill.maxLevel) {
    return `${skill.label} is maxed. ${skill.menuSummary} ${effectSummary}.`;
  }

  return `${skill.label} ${level}/${skill.maxLevel}. ${skill.menuSummary} ${effectSummary}.`;
}

function skillTriggerTitle(hero: Hero) {
  return getHeroSkillPoints(hero) > 0
    ? `${hero.name} has ${getHeroSkillPoints(hero)} skill point${getHeroSkillPoints(hero) === 1 ? '' : 's'}`
    : `${hero.name} skill progress ${getXpChargePercent(hero)}%`;
}

function scoutTriggerTitle(hero: Hero) {
  if (hero.carryingPayload) {
    return 'Empty hands before scouting';
  }

  const active = getActiveScoutOption(hero);
  return active ? `Scouting for ${active.label}` : 'Choose scout target';
}

function scoutOptionTitle(hero: Hero, option: ScoutOption) {
  if (hero.carryingPayload) {
    return 'Empty hands before scouting';
  }

  if (!option.unlocked) {
    return `${option.label} is locked`;
  }

  return `Scout for ${option.label}`;
}

function isMine(heroId: string) {
  return isHeroClaimedByCurrentPlayer(heroId, currentPlayerId.value);
}

function canClaim(heroId: string) {
  return canControlHero(heroId, currentPlayerId.value) && !isMine(heroId);
}

function heroStatus(heroId: string) {
  if (isMine(heroId)) {
    return 'Yours';
  }

  const ownerName = getHeroOwnerName(heroId);
  return ownerName ? ownerName : 'Public';
}

function statusClass(heroId: string) {
  if (isMine(heroId)) {
    return 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100';
  }

  if (isHeroClaimedByOtherPlayer(heroId, currentPlayerId.value)) {
    return 'bg-amber-500/20 border-amber-400/40 text-amber-100';
  }

  return 'bg-cyan-500/20 border-cyan-400/40 text-cyan-100';
}

function cardClass(heroId: string) {
  const isSelected = selectedHeroId.value === heroId;
  const classes = [isSelected ? 'hero-card-selected' : 'hero-card-tucked'];

  if (isHeroClaimedByOtherPlayer(heroId, currentPlayerId.value)) {
    classes.push('hero-card-claimed-other');
  }

  return classes.join(' ');
}

function cardStyle(index: number) {
  const rotation = ((index % 5) - 2) * 1.7;
  return {
    '--hero-card-rotation': `${rotation}deg`,
  };
}

const isMobile = ref(false);
const expanded = ref(false);
let mobileScrollSelectTimer: ReturnType<typeof window.setTimeout> | null = null;
let mobileProgrammaticScrollTimer: ReturnType<typeof window.setTimeout> | null = null;
let isMobileProgrammaticScroll = false;

function updateIsMobile() {
  isMobile.value = window.matchMedia('(max-width: 640px)').matches;
  if (!isMobile.value) expanded.value = false;
  closeFloatingMenus();
  void nextTick(() => scrollSelectedMobileCardIntoView('auto'));
}

const mqListener = () => updateIsMobile();

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', mqListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', mqListener);
});

let touchStartY = 0;
let touchStartX = 0;
let touchActive = false;

function onStripTouchStart(e: TouchEvent) {
  if (!isMobile.value || !e.touches.length) return;
  const target = e.target as HTMLElement;
  if (target.closest('button')) return;

  touchActive = true;
  const touch = e.touches[0];
  if (!touch) return;
  touchStartY = touch.clientY;
  touchStartX = touch.clientX;
}

function onStripTouchMove(e: TouchEvent) {
  if (!touchActive || !e.touches.length) return;
  const touch = e.touches[0];
  if (!touch) return;
  const dy = touch.clientY - touchStartY;
  const dx = touch.clientX - touchStartX;
  // Only intercept clearly vertical swipes; let horizontal scroll through
  if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 2) {
    e.preventDefault();
  }
}

function onStripTouchEnd(e: TouchEvent) {
  if (!touchActive) return;
  touchActive = false;
  const touch = e.changedTouches[0];
  if (!touch) return;
  const dy = touch.clientY - touchStartY;
  if (dy < -40 && !expanded.value) expanded.value = true;
  else if (dy > 40 && expanded.value) expanded.value = false;
}

function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeFloatingMenus();
  }
}

function onStripScroll() {
  closeFloatingMenus();
  if (!isMobile.value || isMobileProgrammaticScroll) {
    return;
  }

  if (mobileScrollSelectTimer) {
    window.clearTimeout(mobileScrollSelectTimer);
  }

  mobileScrollSelectTimer = window.setTimeout(selectCenteredMobileHero, 120);
}

function selectCenteredMobileHero() {
  mobileScrollSelectTimer = null;
  const strip = stripRef.value;
  if (!strip || !isMobile.value) {
    return;
  }

  const center = strip.getBoundingClientRect().left + (strip.clientWidth / 2);
  let closestCard: HTMLElement | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const card of strip.querySelectorAll<HTMLElement>('.hero-card')) {
    const rect = card.getBoundingClientRect();
    const distance = Math.abs((rect.left + (rect.width / 2)) - center);
    if (distance < closestDistance) {
      closestCard = card;
      closestDistance = distance;
    }
  }

  const heroId = closestCard?.dataset.heroId;
  if (!heroId || heroId === selectedHeroId.value) {
    return;
  }

  const hero = heroes.find((entry) => entry.id === heroId);
  if (hero) {
    selectHero(hero, false);
  }
}

function scrollSelectedMobileCardIntoView(behavior: ScrollBehavior = 'smooth') {
  const strip = stripRef.value;
  const heroId = selectedHeroId.value;
  if (!strip || !isMobile.value || !heroId) {
    return;
  }

  const card = strip.querySelector<HTMLElement>(`.hero-card[data-hero-id="${CSS.escape(heroId)}"]`);
  if (!card) {
    return;
  }

  isMobileProgrammaticScroll = true;
  card.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });

  if (mobileProgrammaticScrollTimer) {
    window.clearTimeout(mobileProgrammaticScrollTimer);
  }
  mobileProgrammaticScrollTimer = window.setTimeout(() => {
    isMobileProgrammaticScroll = false;
    mobileProgrammaticScrollTimer = null;
  }, behavior === 'smooth' ? 360 : 40);
}

onMounted(() => {
  const strip = stripRef.value;
  if (!strip) {
    return;
  }

  strip.addEventListener('touchstart', onStripTouchStart, { passive: true });
  strip.addEventListener('touchmove', onStripTouchMove, { passive: false });
  strip.addEventListener('touchend', onStripTouchEnd);
  strip.addEventListener('touchcancel', onStripTouchEnd);
  strip.addEventListener('scroll', onStripScroll, { passive: true });
  document.addEventListener('pointerdown', closeFloatingMenus);
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  const strip = stripRef.value;
  if (strip) {
    strip.removeEventListener('touchstart', onStripTouchStart);
    strip.removeEventListener('touchmove', onStripTouchMove);
    strip.removeEventListener('touchend', onStripTouchEnd);
    strip.removeEventListener('touchcancel', onStripTouchEnd);
    strip.removeEventListener('scroll', onStripScroll);
  }

  document.removeEventListener('pointerdown', closeFloatingMenus);
  document.removeEventListener('keydown', onDocumentKeydown);

  if (mobileScrollSelectTimer) {
    window.clearTimeout(mobileScrollSelectTimer);
  }
  if (mobileProgrammaticScrollTimer) {
    window.clearTimeout(mobileProgrammaticScrollTimer);
  }
});

watch(selectedHeroId, () => {
  void nextTick(() => scrollSelectedMobileCardIntoView());
});
</script>

<style scoped>
.heroes-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 30;
  width: 100%;
  height: 12.65rem;
  pointer-events: none;
}

.heroes-avatar-strip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 0.75rem;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
  scrollbar-width: none; /* Firefox */
  background: linear-gradient(to top, rgba(21, 51, 35, 0.22), rgba(21, 51, 35, 0));
}

.heroes-avatar-strip::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

.hero-card {
  --hero-card-rotation: 0deg;
  position: relative;
  isolation: isolate;
  flex: 0 0 12.45rem;
  width: 12.45rem;
  height: 12.1rem;
  margin-left: -1.8rem;
  display: grid;
  grid-template-rows: auto 4.65rem auto;
  gap: 0.36rem;
  padding: 0.55rem;
  overflow: hidden;
  color: rgba(255, 251, 235, 0.96);
  border: 1px solid rgba(24, 83, 55, 0.78);
  border-radius: 0.82rem;
  background:
    radial-gradient(circle at 28% 15%, rgb(111, 153, 108), transparent 34%),
    radial-gradient(circle at 78% 18%, rgb(91, 139, 128), transparent 32%),
    linear-gradient(155deg, rgb(73, 118, 73), rgb(45, 90, 68) 50%, rgb(106, 89, 49));
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.18) inset,
    0 -1px 0 rgba(0, 0, 0, 0.26) inset,
    0 12px 24px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  user-select: none;
  transform-origin: bottom center;
  transition:
    transform 0.24s cubic-bezier(0.2, 0.9, 0.2, 1),
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    filter 0.2s ease;
}

.hero-card:first-child {
  margin-left: 0;
}

.hero-card::before {
  content: "";
  position: absolute;
  inset: 0.28rem;
  z-index: -1;
  border: 1px solid rgba(13, 56, 38, 0.48);
  border-radius: 0.58rem;
  pointer-events: none;
}

.hero-card-shine {
  position: absolute;
  inset: -35% -20% auto;
  height: 58%;
  z-index: -1;
  background: linear-gradient(110deg, transparent 20%, rgba(255, 255, 255, 0.16), transparent 66%);
  transform: rotate(-8deg);
  opacity: 0.7;
  pointer-events: none;
}

.hero-card-tucked {
  z-index: 1;
  transform: translateY(48%) rotate(var(--hero-card-rotation)) scale(0.96);
  filter: saturate(0.94) brightness(0.96);
}

.hero-card-tucked:hover {
  z-index: 4;
  transform: translateY(38%) rotate(calc(var(--hero-card-rotation) * 0.55)) scale(0.98);
  filter: saturate(1) brightness(1);
}

.hero-card-selected {
  z-index: 8;
  border-color: rgba(25, 104, 70, 0.95);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.24) inset,
    0 -1px 0 rgba(0, 0, 0, 0.26) inset,
    0 8px 0 rgba(9, 27, 18, 0.22),
    0 24px 36px rgba(0, 0, 0, 0.46);
  transform: translateY(0) rotate(0deg) scale(1.02);
  filter: saturate(1.08) brightness(1.04);
}

.hero-card-claimed-other {
  filter: saturate(0.82) brightness(0.88);
}

.hero-card-header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.45rem;
}

.hero-card-name {
  min-width: 0;
  padding-left: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
}

.hero-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  min-width: 0;
}

.hero-status-pill,
.hero-action-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 0.95rem;
  padding: 0 0.34rem;
  border-radius: 999px;
  font-size: 0.5rem;
  font-weight: 850;
  line-height: 1;
}

.hero-action-pill {
  border: 1px solid rgba(255, 255, 255, 0.12);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.hero-action-pill-claim {
  background: rgba(16, 185, 129, 0.22);
  border-color: rgba(52, 211, 153, 0.44);
  color: rgba(209, 250, 229, 0.96);
}

.hero-action-pill-release {
  background: rgba(15, 23, 42, 0.62);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(226, 232, 240, 0.96);
}

.hero-action-pill:hover {
  background: rgba(255, 255, 255, 0.12);
}

.hero-card-portrait {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2.25rem;
  align-items: stretch;
  gap: 0.38rem;
}

.hero-card-portrait-frame {
  position: relative;
  min-height: 0;
  overflow: visible;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(20, 78, 53, 0.68);
  border-radius: 0.58rem;
  background:
    linear-gradient(180deg, rgba(255, 248, 205, 0.12), rgba(12, 31, 23, 0.22)),
    radial-gradient(circle at 50% 74%, rgba(52, 211, 153, 0.2), transparent 45%);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.2) inset;
}

.hero-card-sprite {
  position: absolute;
  left: 50%;
  bottom: 3.2325rem;
  width: 2rem;
  height: 2rem;
  transform: translateX(calc(-50% - 2.1875rem)) scale(1.04);
  z-index: 2;
  mix-blend-mode: normal;
  filter: saturate(0.96) contrast(0.98) brightness(0.98);
  opacity: 0.95;
}

.hero-card-xp {
  align-self: end;
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: 0.05rem;
  padding: 0.24rem 0.2rem;
  border: 1px solid rgba(20, 78, 53, 0.64);
  border-radius: 0.5rem;
  background: rgba(22, 60, 45, 0.44);
}

.hero-card-xp span {
  font-size: 0.46rem;
  font-weight: 900;
  line-height: 1;
  color: rgba(209, 250, 229, 0.76);
}

.hero-card-xp strong {
  font-size: 0.74rem;
  font-weight: 950;
  line-height: 1;
  color: rgba(255, 251, 235, 0.98);
}

.hero-card-controls {
  display: grid;
  gap: 0.28rem;
  min-height: 4.45rem;
  opacity: 0;
  transform: translateY(0.25rem);
  pointer-events: none;
  transition: opacity 0.16s ease, transform 0.2s ease;
}

.hero-card-controls-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.scout-controls {
  position: relative;
  display: grid;
  padding-top: 0.25rem;
  border-top: 1px solid rgba(225, 244, 190, 0.16);
  z-index: 4;
}

.scout-menu-trigger {
  --scout-color: #e2e8f0;
  width: 100%;
  min-height: 1.92rem;
  padding: 0.22rem 0.38rem;
  display: grid;
  grid-template-columns: 1rem minmax(4.8rem, 1fr) 0.55rem;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid rgba(225, 244, 190, 0.18);
  border-radius: 6px;
  background: rgba(35, 83, 46, 0.52);
  color: rgba(236, 253, 245, 0.92);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.scout-menu-trigger:hover:not(:disabled) {
  border-color: var(--scout-color);
  background: rgba(65, 103, 49, 0.78);
  transform: translateY(-1px);
}

.scout-menu-trigger:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.scout-menu-trigger-active {
  border-color: var(--scout-color);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--scout-color) 42%, transparent);
}

.scout-trigger-icon {
  position: relative;
  width: 0.9rem;
  height: 0.9rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.scout-trigger-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--scout-color);
  box-shadow: 0 0 8px color-mix(in srgb, var(--scout-color) 65%, transparent);
}

.scout-trigger-sweep {
  position: absolute;
  width: 0.42rem;
  height: 0.1rem;
  right: 0.05rem;
  bottom: 0.1rem;
  border-radius: 999px;
  background: currentColor;
  transform: rotate(45deg);
  transform-origin: center;
}

.scout-trigger-copy {
  min-width: 0;
  display: grid;
  gap: 0.08rem;
  text-align: left;
}

.scout-trigger-kicker {
  font-size: 0.5rem;
  font-weight: 800;
  line-height: 1;
  color: rgba(190, 242, 100, 0.78);
  text-transform: uppercase;
}

.scout-trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1.08;
}

.scout-trigger-caret {
  width: 0.45rem;
  height: 0.45rem;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  opacity: 0.72;
  transition: transform 0.15s ease;
}

.scout-controls-open .scout-trigger-caret {
  transform: translateY(0.15rem) rotate(225deg);
}

.scout-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 0.35rem);
  z-index: 60;
  width: min(15.5rem, calc(100vw - 1rem));
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.3rem;
  padding: 0.35rem;
  border: 1px solid rgba(225, 244, 190, 0.18);
  border-radius: 8px;
  background: rgba(15, 38, 29, 0.94);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
}

.scout-option {
  --scout-color: #e2e8f0;
  min-height: 2.8rem;
  padding: 0.38rem 0.42rem;
  display: grid;
  grid-template-columns: 0.55rem minmax(0, 1fr);
  align-items: center;
  gap: 0.35rem;
  border: 1px solid rgba(225, 244, 190, 0.14);
  border-radius: 6px;
  background: rgba(26, 63, 45, 0.64);
  color: rgba(236, 253, 245, 0.94);
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.scout-option:hover:not(:disabled) {
  border-color: var(--scout-color);
  background: rgba(47, 82, 52, 0.84);
  transform: translateY(-1px);
}

.scout-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scout-option-active {
  border-color: var(--scout-color);
  background: color-mix(in srgb, var(--scout-color) 18%, rgba(30, 72, 47, 0.82));
}

.scout-option-mark {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--scout-color);
  box-shadow: 0 0 8px color-mix(in srgb, var(--scout-color) 64%, transparent);
}

.scout-option-copy {
  min-width: 0;
  display: grid;
  gap: 0.12rem;
}

.scout-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.7rem;
  font-weight: 900;
  line-height: 1.05;
}

.scout-option-summary,
.scout-option-state {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.55rem;
  font-weight: 750;
  line-height: 1;
  color: rgba(203, 213, 225, 0.88);
}

.scout-option-state {
  grid-column: 2;
  color: rgba(190, 242, 100, 0.9);
}

.scout-option-state-locked {
  color: rgba(251, 191, 36, 0.9);
}

.skill-controls {
  position: relative;
  display: grid;
  padding-top: 0.25rem;
  border-top: 1px solid rgba(250, 204, 21, 0.18);
  z-index: 3;
}

.skill-menu-trigger {
  width: 100%;
  min-height: 1.92rem;
  padding: 0.22rem 0.38rem;
  display: grid;
  grid-template-columns: 1rem minmax(4.8rem, 1fr) 0.55rem;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid rgba(250, 204, 21, 0.24);
  border-radius: 6px;
  background: rgba(88, 59, 18, 0.58);
  color: rgba(255, 251, 235, 0.96);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.skill-menu-trigger:hover {
  border-color: rgba(250, 204, 21, 0.62);
  background: rgba(120, 73, 18, 0.78);
  transform: translateY(-1px);
}

.skill-menu-trigger-ready {
  border-color: rgba(250, 204, 21, 0.72);
  box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.28);
  animation: skill-ready-pulse 1.45s ease-in-out infinite;
}

.skill-trigger-code {
  width: 0.95rem;
  height: 0.95rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.2);
  color: rgba(254, 243, 199, 0.98);
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1;
}

.skill-trigger-copy {
  min-width: 0;
  display: grid;
  gap: 0.08rem;
  text-align: left;
}

.skill-trigger-kicker {
  font-size: 0.5rem;
  font-weight: 800;
  line-height: 1;
  color: rgba(253, 230, 138, 0.78);
  text-transform: uppercase;
}

.skill-trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1.08;
}

.skill-trigger-caret {
  width: 0.45rem;
  height: 0.45rem;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  opacity: 0.72;
  transition: transform 0.15s ease;
}

.skill-controls-open .skill-trigger-caret {
  transform: translateY(0.15rem) rotate(225deg);
}

@keyframes skill-ready-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.28), 0 0 0 rgba(250, 204, 21, 0);
  }

  50% {
    box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.52), 0 0 12px rgba(250, 204, 21, 0.36);
  }
}

.skill-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 0.35rem);
  z-index: 60;
  width: min(27rem, calc(100vw - 1rem));
  max-height: min(26rem, calc(100vh - 2rem));
  overflow-y: auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.38rem;
  padding: 0.42rem;
  border: 1px solid rgba(250, 204, 21, 0.24);
  border-radius: 8px;
  background: rgba(35, 28, 15, 0.97);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
}

.hero-floating-menu.scout-menu,
.hero-floating-menu.skill-menu {
  position: fixed;
  z-index: 10000;
  pointer-events: auto;
}

.skill-option {
  min-height: 5rem;
  padding: 0.5rem;
  display: grid;
  grid-template-columns: 1.1rem minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.48rem;
  border: 1px solid rgba(250, 204, 21, 0.18);
  border-radius: 6px;
  background: rgba(78, 58, 28, 0.72);
  color: rgba(255, 251, 235, 0.96);
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.skill-option:hover:not(:disabled) {
  border-color: rgba(250, 204, 21, 0.64);
  background: rgba(120, 73, 18, 0.78);
  transform: translateY(-1px);
}

.skill-option:disabled {
  opacity: 0.78;
  cursor: not-allowed;
}

.skill-option-code {
  width: 0.95rem;
  height: 0.95rem;
  margin-top: 0.04rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.18);
  font-size: 0.68rem;
  font-weight: 900;
  line-height: 1;
}

.skill-option-copy {
  min-width: 0;
  display: grid;
  gap: 0.22rem;
}

.skill-option-topline {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
}

.skill-option-label {
  min-width: 0;
  font-size: 0.64rem;
  font-weight: 900;
  line-height: 1.1;
}

.skill-option-level {
  flex: 0 0 auto;
  padding: 0.08rem 0.26rem;
  border: 1px solid rgba(250, 204, 21, 0.2);
  border-radius: 999px;
  background: rgba(18, 24, 20, 0.24);
  font-size: 0.52rem;
  font-weight: 850;
  line-height: 1;
  color: rgba(254, 243, 199, 0.82);
}

.skill-option-summary,
.skill-option-state {
  min-width: 0;
  font-size: 0.55rem;
  font-weight: 800;
  line-height: 1.25;
  color: rgba(254, 243, 199, 0.78);
}

.skill-option-summary {
  max-width: 100%;
}

.skill-option-effects {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.22rem;
}

.skill-option-effect {
  display: inline-flex;
  align-items: center;
  min-height: 1rem;
  padding: 0.14rem 0.28rem;
  border: 1px solid rgba(255, 251, 235, 0.1);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.22);
  color: rgba(255, 251, 235, 0.64);
  font-size: 0.5rem;
  font-weight: 800;
  line-height: 1.05;
}

.skill-option-effect-active {
  border-color: rgba(134, 239, 172, 0.34);
  background: rgba(21, 128, 61, 0.22);
  color: rgba(220, 252, 231, 0.92);
}

.skill-option-effect-next {
  border-color: rgba(250, 204, 21, 0.52);
  background: rgba(161, 98, 7, 0.32);
  color: rgba(254, 243, 199, 0.98);
}

.skill-option-state {
  align-self: start;
  justify-self: end;
  white-space: nowrap;
  color: rgba(250, 204, 21, 0.95);
}

@media (max-width: 640px) {
  .heroes-bar {
    height: 13.7rem;
  }

  .heroes-avatar-strip {
    --mobile-card-width: min(82vw, 13.25rem);
    pointer-events: auto;
    align-items: flex-end;
    gap: 0;
    overflow-x: auto;
    overflow-y: visible;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: calc((100vw - var(--mobile-card-width)) / 2);
    padding: 0 calc((100vw - var(--mobile-card-width)) / 2) 0.35rem;
    touch-action: pan-x;
    overscroll-behavior-x: contain;
    background: linear-gradient(to top, rgba(21, 51, 35, 0.35), rgba(21, 51, 35, 0));
  }

  .hero-card {
    flex: 0 0 var(--mobile-card-width);
    width: var(--mobile-card-width);
    height: 12.35rem;
    margin-left: -1.05rem;
    scroll-snap-align: center;
    scroll-snap-stop: always;
  }

  .hero-card:first-child {
    margin-left: 0;
  }

  .hero-card-tucked {
    z-index: 1;
    transform: translateY(1.6rem) rotate(var(--hero-card-rotation)) scale(0.92);
    filter: saturate(0.9) brightness(0.93);
  }

  .hero-card-tucked:hover {
    transform: translateY(1.15rem) rotate(calc(var(--hero-card-rotation) * 0.55)) scale(0.95);
  }

  .hero-card-selected {
    z-index: 6;
    transform: translateY(0) rotate(0deg) scale(1);
  }

  .hero-card-controls {
    min-height: 4.55rem;
  }

  .scout-menu-trigger,
  .skill-menu-trigger {
    min-height: 2rem;
  }

  .hero-floating-menu.scout-menu {
    width: min(18rem, calc(100vw - 1rem)) !important;
  }

  .hero-floating-menu.skill-menu {
    width: min(25rem, calc(100vw - 1rem)) !important;
    max-height: min(24rem, calc(100vh - 1rem));
  }
}

.heroes-sheet-enter-active, .heroes-sheet-leave-active { transition: transform .18s ease; }
.heroes-sheet-enter-from, .heroes-sheet-leave-to { transform: translateY(80px); }
.heroes-sheet-enter-to, .heroes-sheet-leave-from { transform: translateY(0); }
.hero-bubble-enter-active, .hero-bubble-leave-active { transition: transform .18s ease; }
.hero-bubble-enter-from, .hero-bubble-leave-to { transform: translateY(200px); }
.hero-bubble-enter-to, .hero-bubble-leave-from { transform: translateY(0); }
</style>

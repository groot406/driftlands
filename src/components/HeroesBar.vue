<template>
  <div class="heroes-bar pointer-events-none overflow-hidden">
    <div ref="stripRef" class="heroes-avatar-strip pointer-events-none overflow-hidden">
      <template v-if="heroes.length">
        <template
          v-for="(hero, index) in heroes"
          :key="hero.id"
        >
          <div v-if="hero.playerId === currentPlayerId" class="hero-card pointer-events-auto"
               :class="cardClass(hero.id)"
               :data-hero-id="hero.id"
               :aria-current="selectedHeroId === hero.id ? 'true' : undefined"
               @click="select(hero)"
               :style="cardStyle(index)">
            <div class="hero-card-shine" aria-hidden="true"></div>
            <div class="hero-card-crest" aria-hidden="true"></div>
            <div class="hero-card-header">
              <span class="hero-card-name">
                {{ hero.name }}
              </span>
              <span class="hero-card-role">{{ heroRole(hero) }}</span>
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
                <div class="hero-card-sprite" :class="{ 'hero-card-sprite--looper': isLooperHero(hero) }">
                  <Sprite :sprite="heroSprite(hero)" :fallback-sprite="hero.avatarFallbackSpriteUrl" :zoom="heroPortraitZoom(hero)" :row="8" :size="32" :frames="2" :speed="450" />
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
                    <span class="skill-trigger-label">{{ getSkillProgressLabel(hero) }}</span>
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
      <div class="skill-menu-header">
        <span class="skill-menu-title">{{ activeFloatingHero.name }} skills</span>
        <span class="skill-menu-points">{{ skillPointCountLabel(activeFloatingHero) }}</span>
      </div>
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
          <span class="skill-option-effect">{{ skill.perLevelText }}</span>
          <span class="skill-option-examples">{{ skill.examples }}</span>
          <span class="skill-option-segments" aria-hidden="true">
            <span
              v-for="segment in skill.maxLevel"
              :key="segment"
              class="skill-option-segment"
              :class="{
                'skill-option-segment-filled': getSkillLevel(activeFloatingHero, skill.key) >= segment,
                'skill-option-segment-next': isNextSkillLevel(activeFloatingHero, skill.key, segment),
              }"
            ></span>
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
import { getStoryHeroTemplate } from '../shared/story/heroRoster.ts';

const scoutResourceColors: Record<ScoutTargetType, string> = {
  wood: '#79d47c',
  water: '#70d6ff',
  stone: '#b9b3a1',
  ore: '#9aa6c7',
  sand: '#e7c979',
  snow: '#dbeafe',
};

function buildHeroSources(): Record<string, string> {
  const heroImageModules = import.meta.glob('../assets/heroes/*.png', { eager: true });
  const sources: Record<string, string> = {};
  for (const path in heroImageModules) {
    const mod = heroImageModules[path] as { default?: string } | string;
    const url = typeof mod === 'string' ? mod : mod.default;
    const nameMatch = path.match(/([^/]+)\.png$/);
    if (!url || !nameMatch) continue;
    sources[nameMatch[1]!] = url;
  }
  return sources;
}

const heroSpriteSources = buildHeroSources();

function heroSprite(hero: Hero): string {
  return hero.avatarSpriteUrl ?? heroSpriteSources[hero.avatar] ?? heroSpriteSources.boy ?? '';
}

function isLooperHero(hero: Hero): boolean {
  return hero.avatarSource === 'looperlands';
}

function heroPortraitZoom(hero: Hero): number {
  return isLooperHero(hero) ? 1.9 : 2;
}

function heroRole(hero: Hero): string {
  return getStoryHeroTemplate(hero.storyTemplateId ?? hero.id)?.role ?? (isLooperHero(hero) ? 'Looper' : 'Hero');
}

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
  skill: 620,
};

const openScoutMenuHeroId = ref<string | null>(null);
const openSkillMenuHeroId = ref<string | null>(null);
const floatingMenu = ref<FloatingMenuState | null>(null);
const stripRef = ref<HTMLElement | null>(null);
const pendingSkillSelection = ref<{ heroId: string; signature: string } | null>(null);

const scoutOptions = computed<ScoutOption[]>(() => SCOUT_TARGET_DEFINITIONS.map((definition) => ({
  type: definition.type,
  label: definition.label,
  summary: definition.summary,
  lockedLabel: `Unlock ${definition.label}`,
  color: scoutResourceColors[definition.type],
  unlocked: isScoutDefinitionUnlocked(definition),
})));

const skillCodes: Record<HeroSkillKey, string> = {
  speed: 'TR',
  strength: 'HW',
  craft: 'BD',
  scouting: 'SC',
  survival: 'FW',
  teamwork: 'TM',
};

const heroSkillOptions = HERO_SKILL_DEFINITIONS.map((skill) => ({
  ...skill,
  code: skillCodes[skill.key],
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
  pendingSkillSelection.value = null;
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
  const points = getHeroSkillPoints(hero);
  return points > 0 ? `${points} ${points === 1 ? 'pt' : 'pts'}` : `XP ${getXpChargePercent(hero)}%`;
}

function canSelectSkill(hero: Hero, skill: HeroSkillKey) {
  return !isPendingSkillSelection(hero)
    && showSkillControls(hero)
    && getHeroSkillPoints(hero) > 0
    && getSkillLevel(hero, skill) < getSkillMaxLevel(skill);
}

function isNextSkillLevel(hero: Hero, skill: HeroSkillKey, level: number) {
  return canSelectSkill(hero, skill) && level === getSkillLevel(hero, skill) + 1;
}

function skillStateLabel(hero: Hero, skill: HeroSkillKey, maxLevel: number) {
  if (isPendingSkillSelection(hero)) {
    return 'Applying';
  }

  if (getSkillLevel(hero, skill) >= maxLevel) {
    return 'Max';
  }

  return getHeroSkillPoints(hero) > 0 ? 'Pick' : 'Need point';
}

function selectSkill(hero: Hero, skill: HeroSkillKey) {
  if (!canSelectSkill(hero, skill)) {
    return;
  }

  pendingSkillSelection.value = { heroId: hero.id, signature: getSkillStateSignature(hero) };
  requestHeroSkillSelect(hero.id, skill);
}

function getSkillMaxLevel(skill: HeroSkillKey) {
  return HERO_SKILL_DEFINITIONS.find((definition) => definition.key === skill)?.maxLevel ?? 10;
}

function hasSelectableSkill(hero: Hero) {
  return showSkillControls(hero)
    && getHeroSkillPoints(hero) > 0
    && heroSkillOptions.some((skill) => getSkillLevel(hero, skill.key) < skill.maxLevel);
}

function isPendingSkillSelection(hero: Hero) {
  return pendingSkillSelection.value?.heroId === hero.id;
}

function getSkillStateSignature(hero: Hero) {
  return [
    getHeroSkillPoints(hero),
    ...heroSkillOptions.map((skill) => getSkillLevel(hero, skill.key)),
  ].join(':');
}

function skillPointCountLabel(hero: Hero) {
  const points = getHeroSkillPoints(hero);
  return points === 1 ? '1 point ready' : `${points} points ready`;
}

function skillTitle(hero: Hero, skill: { key: HeroSkillKey; label: string; menuSummary: string; perLevelText: string; examples: string; maxLevel: number }) {
  const level = getSkillLevel(hero, skill.key);
  if (getHeroSkillPoints(hero) <= 0) {
    return `${skill.label} ${level}/${skill.maxLevel}. ${skill.menuSummary} ${skill.perLevelText}. ${skill.examples} ${hero.name} has no skill points.`;
  }

  if (level >= skill.maxLevel) {
    return `${skill.label} is maxed. ${skill.menuSummary} ${skill.perLevelText}. ${skill.examples}`;
  }

  return `${skill.label} ${level}/${skill.maxLevel}. ${skill.menuSummary} ${skill.perLevelText}. ${skill.examples}`;
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
  const palettes = [
    { accent: '#55b7ff', panel: '#102f49' },
    { accent: '#85c94c', panel: '#183d22' },
    { accent: '#b868ff', panel: '#302044' },
    { accent: '#e4b34b', panel: '#473017' },
    { accent: '#7ee3cf', panel: '#133c3d' },
  ];
  const palette = palettes[index % palettes.length]!;
  return {
    '--hero-card-rotation': `${rotation}deg`,
    '--hero-accent': palette.accent,
    '--hero-panel': palette.panel,
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

watch(() => {
  const hero = activeFloatingHero.value;
  if (!hero || floatingMenu.value?.kind !== 'skill') {
    return null;
  }

  return `${hero.id}:${getSkillStateSignature(hero)}`;
}, () => {
  const pending = pendingSkillSelection.value;
  const hero = activeFloatingHero.value;
  if (!pending || !hero || hero.id !== pending.heroId || getSkillStateSignature(hero) === pending.signature) {
    return;
  }

  pendingSkillSelection.value = null;
  if (!hasSelectableSkill(hero)) {
    closeFloatingMenus();
  }
});
</script>

<style scoped>
.heroes-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 30;
  width: 100%;
  height: 14.1rem;
  pointer-events: none;
  overflow: visible;
}

.heroes-avatar-strip {
  position: absolute;
  left: clamp(0.45rem, 1vw, 0.9rem);
  right: auto;
  bottom: 0;
  width: 100%;
  height: 13.75rem;
  display: flex;
  align-items: flex-end;
  overflow-x: auto;
  overflow-y: visible;
  padding: 1.15rem 0.9rem 0.7rem;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
  scrollbar-width: none; /* Firefox */
  background:
    linear-gradient(to top, rgba(4, 10, 12, 0.54), rgba(4, 10, 12, 0.18) 42%, rgba(4, 10, 12, 0)),
    radial-gradient(ellipse at 12% 100%, rgba(0, 0, 0, 0.35), transparent 68%);
}

.heroes-avatar-strip::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

.hero-card {
  --hero-card-rotation: 0deg;
  --hero-accent: #55b7ff;
  --hero-panel: #102f49;
  position: relative;
  isolation: isolate;
  flex: 0 0 10.8rem;
  width: 10.8rem;
  height: 12rem;
  margin-left: 0.26rem;
  display: grid;
  grid-template-rows: 0.72rem 4.85rem 1.8rem 2.85rem;
  gap: 0.24rem;
  padding: 0.5rem;
  overflow: hidden;
  color: rgba(255, 251, 235, 0.96);
  border: 2px solid rgba(10, 14, 18, 0.96);
  border-radius: 0.36rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--hero-accent) 14%, transparent), transparent 20%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 14px),
    linear-gradient(180deg, color-mix(in srgb, var(--hero-panel) 94%, #ffffff 6%), var(--hero-panel) 58%, rgba(8, 11, 15, 0.96));
  background-size: auto, auto, auto;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--hero-accent) 42%, rgba(0, 0, 0, 0.65)) inset,
    0 2px 0 rgba(255, 255, 255, 0.11) inset,
    0 -3px 0 rgba(0, 0, 0, 0.42) inset,
    0 14px 24px rgba(0, 0, 0, 0.45);
  image-rendering: pixelated;
  clip-path: polygon(0.42rem 0, calc(100% - 0.42rem) 0, 100% 0.42rem, 100% calc(100% - 0.42rem), calc(100% - 0.42rem) 100%, 0.42rem 100%, 0 calc(100% - 0.42rem), 0 0.42rem);
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
  inset: 0.32rem;
  z-index: -1;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 46%, rgba(255, 236, 169, 0.36));
  border-radius: 0.16rem;
  background:
    radial-gradient(ellipse at 50% 31%, color-mix(in srgb, var(--hero-accent) 16%, transparent), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 22%, rgba(0, 0, 0, 0.18));
  pointer-events: none;
}

.hero-card::after {
  content: "";
  position: absolute;
  inset: 0.18rem;
  z-index: -1;
  border-radius: 0.18rem;
  box-shadow:
    0.18rem 0.18rem 0 color-mix(in srgb, var(--hero-accent) 42%, rgba(0, 0, 0, 0.7)) inset,
    -0.18rem 0.18rem 0 color-mix(in srgb, var(--hero-accent) 34%, rgba(0, 0, 0, 0.7)) inset;
  opacity: 0.34;
  pointer-events: none;
}

.hero-card-shine {
  position: absolute;
  inset: -35% -20% auto;
  height: 58%;
  z-index: -1;
  background: linear-gradient(110deg, transparent 20%, rgba(255, 246, 190, 0.1), transparent 66%);
  transform: rotate(-8deg);
  opacity: 0.35;
  pointer-events: none;
}

.hero-card-crest {
  position: absolute;
  top: 0.18rem;
  left: 50%;
  z-index: 4;
  width: 1.55rem;
  height: 1.55rem;
  border: 2px solid rgba(12, 14, 16, 0.95);
  border-radius: 0.12rem;
  background:
    radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.45), transparent 24%),
    linear-gradient(180deg, color-mix(in srgb, var(--hero-accent) 68%, #fff0a6 12%), color-mix(in srgb, var(--hero-panel) 78%, #000 22%));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--hero-accent) 60%, rgba(255, 221, 126, 0.45)),
    0 4px 10px rgba(0, 0, 0, 0.35);
  transform: translateX(-50%);
  pointer-events: none;
}

.hero-card-crest::before {
  content: "";
  position: absolute;
  inset: 0.43rem;
  border-radius: 0.15rem;
  background: rgba(255, 246, 207, 0.86);
  box-shadow: 0 0 10px color-mix(in srgb, var(--hero-accent) 70%, transparent);
  transform: rotate(45deg);
}

.hero-card-tucked {
  z-index: 1;
  transform: translateY(1.18rem) rotate(var(--hero-card-rotation)) scale(0.95);
  filter: saturate(0.86) brightness(0.82);
}

.hero-card-tucked:hover {
  z-index: 4;
  transform: translateY(0.68rem) rotate(calc(var(--hero-card-rotation) * 0.45)) scale(0.99);
  filter: saturate(1.02) brightness(0.98);
}

.hero-card-selected {
  z-index: 8;
  transform: translateY(-0.2rem) rotate(0deg) scale(1.02);
  filter: saturate(1.08) brightness(1.04);
}

.hero-card-claimed-other {
  filter: saturate(0.82) brightness(0.88);
}

.hero-card-header {
  grid-row: 3;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  justify-items: center;
  gap: 0.12rem;
  padding: 0.26rem 0.28rem;
  border-top: 1px solid color-mix(in srgb, var(--hero-accent) 38%, rgba(255, 234, 180, 0.22));
  border-bottom: 1px solid rgba(0, 0, 0, 0.34);
  background:
    linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.25), transparent),
    rgba(0, 0, 0, 0.16);
  text-align: center;
}

.hero-card-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  /* font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace; */
  font-size: 0.64rem;
  font-weight: 900;
  line-height: 1;
  color: rgba(255, 248, 220, 0.98);
  /* text-shadow: 0 1px 0px rgb(5 4 4 / 68%), 0 0 8px rgba(0, 0, 0, 0.55); */
  text-transform: uppercase;
  margin-top: 4px;
  margin: 4px;
}

.hero-card-role {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hero-accent);
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.46rem;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.72);
  text-transform: uppercase;
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
  grid-row: 2;
  position: relative;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
}

.hero-card-portrait-frame {
  position: relative;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 42%, rgba(255, 231, 164, 0.18));
  border-radius: 0.14rem;
  background:
    radial-gradient(ellipse at 50% 76%, color-mix(in srgb, var(--hero-accent) 24%, transparent), transparent 54%),
    radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.07), transparent 36%),
    rgba(0, 0, 0, 0.18);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.11) inset,
    0 10px 18px rgba(0, 0, 0, 0.22) inset;
}

.hero-card-portrait-frame::before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 0.32rem;
  width: 4.8rem;
  height: 0.72rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--hero-accent) 32%, rgba(0, 0, 0, 0.62));
  filter: blur(1px);
  transform: translateX(-50%);
  opacity: 0.78;
}

.hero-card-sprite {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4rem;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -42%);
  z-index: 2;
  mix-blend-mode: normal;
  filter: saturate(1.05) contrast(1.02) brightness(1.02) drop-shadow(0 8px 7px rgba(0, 0, 0, 0.36));
  opacity: 0.98;
}

.hero-card-sprite--looper {
  align-items: center;
  bottom: auto;
  display: flex;
  height: 100%;
  justify-content: center;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -48%);
  width: 100%;
}

.hero-card-xp {
  position: absolute;
  right: 0.32rem;
  top: 0.3rem;
  z-index: 3;
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: 0.05rem;
  width: 2.1rem;
  padding: 0.22rem 0.16rem;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 48%, rgba(255, 226, 144, 0.28));
  border-radius: 0.12rem;
  background:
    linear-gradient(180deg, rgba(255, 248, 190, 0.16), rgba(0, 0, 0, 0.36)),
    rgba(7, 12, 16, 0.74);
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.22);
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
  grid-row: 4;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-content: end;
  gap: 0.22rem;
  min-height: 2.65rem;
  padding: 0.14rem 0.06rem 0.02rem;
  border-top: 1px solid color-mix(in srgb, var(--hero-accent) 22%, rgba(255, 232, 170, 0.14));
  background:
    linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.2), transparent),
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(0, 0, 0, 0.18));
  opacity: 0;
  transform: translateY(0.22rem);
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
  padding-top: 0;
  z-index: 4;
}

.scout-menu-trigger {
  --scout-color: #e2e8f0;
  position: relative;
  width: 100%;
  min-height: 2.08rem;
  padding: 0.2rem 0.18rem 0.16rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 0.88rem auto;
  justify-items: center;
  align-items: center;
  gap: 0.08rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 28%, rgba(255, 237, 164, 0.12));
  border-radius: 0.08rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 36%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 8px),
    color-mix(in srgb, var(--hero-panel) 72%, rgba(5, 8, 10, 0.88));
  color: rgba(236, 253, 245, 0.92);
  image-rendering: pixelated;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.44) inset,
    0 1px 0 rgba(255, 255, 255, 0.07) inset,
    0 -2px 0 rgba(0, 0, 0, 0.34) inset;
  clip-path: polygon(0.22rem 0, calc(100% - 0.22rem) 0, 100% 0.22rem, 100% calc(100% - 0.22rem), calc(100% - 0.22rem) 100%, 0.22rem 100%, 0 calc(100% - 0.22rem), 0 0.22rem);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.scout-menu-trigger::before,
.skill-menu-trigger::before {
  content: "";
  position: absolute;
  inset: 0.17rem;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 16%, rgba(255, 255, 255, 0.08));
  pointer-events: none;
}

.scout-menu-trigger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--hero-accent) 44%, rgba(255, 237, 164, 0.16));
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 36%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 8px),
    color-mix(in srgb, var(--hero-panel) 66%, rgba(7, 12, 14, 0.88));
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.44) inset,
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 -2px 0 rgba(0, 0, 0, 0.34) inset,
    0 0 8px color-mix(in srgb, var(--hero-accent) 18%, transparent);
  transform: translateY(-1px);
}

.scout-menu-trigger:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.scout-menu-trigger-active {
  border-color: color-mix(in srgb, var(--scout-color) 54%, var(--hero-accent) 18%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--scout-color) 22%, transparent),
    0 -2px 0 rgba(0, 0, 0, 0.34) inset;
}

.scout-trigger-icon {
  position: relative;
  width: 0.92rem;
  height: 0.86rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.scout-trigger-dot {
  width: 0.58rem;
  height: 0.58rem;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 0.08rem;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.3), transparent 36%),
    var(--scout-color);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.44),
    0 0 8px color-mix(in srgb, var(--scout-color) 46%, transparent);
  transform: rotate(45deg);
}

.scout-trigger-sweep {
  position: absolute;
  width: 0.48rem;
  height: 0.11rem;
  right: 0.05rem;
  bottom: 0.1rem;
  border-radius: 0.02rem;
  background: currentColor;
  transform: rotate(45deg);
  transform-origin: center;
}

.scout-trigger-copy {
  min-width: 0;
  display: grid;
  gap: 0.04rem;
  text-align: center;
}

.scout-trigger-kicker {
  display: none;
}

.scout-trigger-label {
  min-width: 0;
  max-width: 4.2rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.42rem;
  font-weight: 800;
  line-height: 1;
  color: rgba(236, 253, 245, 0.84);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.72);
}

.scout-trigger-caret {
  display: none;
}

.scout-controls-open .scout-trigger-caret {
  display: none;
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
  padding-top: 0;
  z-index: 3;
}

.skill-menu-trigger {
  position: relative;
  width: 100%;
  min-height: 2.18rem;
  padding: 0.22rem 0.2rem 0.18rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 1rem auto;
  justify-items: center;
  align-items: center;
  gap: 0.1rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 28%, rgba(250, 204, 21, 0.16));
  border-radius: 0.08rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 36%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 8px),
    color-mix(in srgb, var(--hero-panel) 68%, rgba(7, 9, 11, 0.9));
  color: rgba(255, 251, 235, 0.96);
  image-rendering: pixelated;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.44) inset,
    0 1px 0 rgba(255, 255, 255, 0.07) inset,
    0 -2px 0 rgba(0, 0, 0, 0.34) inset;
  clip-path: polygon(0.22rem 0, calc(100% - 0.22rem) 0, 100% 0.22rem, 100% calc(100% - 0.22rem), calc(100% - 0.22rem) 100%, 0.22rem 100%, 0 calc(100% - 0.22rem), 0 0.22rem);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.skill-menu-trigger:hover {
  border-color: color-mix(in srgb, var(--hero-accent) 42%, rgba(250, 204, 21, 0.18));
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 36%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 8px),
    color-mix(in srgb, var(--hero-panel) 62%, rgba(8, 12, 13, 0.9));
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.44) inset,
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 -2px 0 rgba(0, 0, 0, 0.34) inset,
    0 0 8px color-mix(in srgb, var(--hero-accent) 16%, transparent);
  transform: translateY(-1px);
}

.skill-menu-trigger-ready {
  border-color: color-mix(in srgb, var(--hero-accent) 48%, rgba(250, 204, 21, 0.32));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--hero-accent) 18%, rgba(250, 204, 21, 0.14)),
    0 -2px 0 rgba(0, 0, 0, 0.34) inset;
  animation: skill-ready-pulse 1.45s ease-in-out infinite;
}

.skill-trigger-code {
  width: 1.1rem;
  height: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 28%, rgba(254, 243, 199, 0.2));
  border-radius: 0.08rem;
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--hero-accent) 35%, rgba(254, 243, 199, 0.28)), transparent 58%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.26));
  color: color-mix(in srgb, var(--hero-accent) 42%, rgba(254, 243, 199, 0.96));
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.74rem;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.7);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.42) inset,
    0 0 7px color-mix(in srgb, var(--hero-accent) 18%, transparent);
}

.skill-trigger-copy {
  min-width: 0;
  display: grid;
  gap: 0.04rem;
  text-align: center;
}

.skill-trigger-kicker {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.42rem;
  font-weight: 800;
  line-height: 1;
  color: color-mix(in srgb, var(--hero-accent) 48%, rgba(255, 251, 235, 0.8));
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.72);
}

.skill-trigger-label {
  min-width: 0;
  max-width: 4.2rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.48rem;
  font-weight: 800;
  line-height: 1;
  color: rgba(254, 243, 199, 0.82);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.72);
}

.skill-trigger-caret {
  display: none;
}

.skill-controls-open .skill-trigger-caret {
  display: none;
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
  width: min(38.75rem, calc(100vw - 1rem));
  max-height: min(30rem, calc(100vh - 1rem));
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.42rem;
  padding: 0.48rem;
  border: 1px solid rgba(178, 255, 214, 0.22);
  border-radius: 0.8rem;
  background:
    linear-gradient(180deg, rgba(120, 255, 205, 0.11), rgba(8, 24, 24, 0.94)),
    rgba(7, 27, 27, 0.94);
  backdrop-filter: blur(12px) saturate(1.16);
  box-shadow:
    0 1px 0 rgba(225, 255, 238, 0.14) inset,
    0 16px 34px rgba(0, 0, 0, 0.42);
}

.hero-floating-menu.scout-menu,
.hero-floating-menu.skill-menu {
  position: fixed;
  z-index: 10000;
  pointer-events: auto;
}

.skill-menu-header {
  grid-column: 1 / -1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.08rem 0.06rem 0.18rem;
  border-bottom: 1px solid rgba(178, 255, 214, 0.14);
}

.skill-menu-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  font-weight: 950;
  line-height: 1;
  color: rgba(255, 251, 235, 0.96);
  text-transform: uppercase;
}

.skill-menu-points {
  flex: 0 0 auto;
  padding: 0.16rem 0.38rem;
  border: 1px solid rgba(250, 204, 21, 0.28);
  border-radius: 0.36rem;
  background: rgba(18, 24, 20, 0.34);
  font-size: 0.58rem;
  font-weight: 900;
  line-height: 1;
  color: rgba(254, 243, 199, 0.9);
}

.skill-option {
  min-height: 6.6rem;
  padding: 0.48rem;
  display: grid;
  grid-template-columns: 1.42rem minmax(0, 1fr);
  align-items: start;
  gap: 0.42rem;
  border: 1px solid rgba(178, 255, 214, 0.15);
  border-radius: 0.55rem;
  background:
    linear-gradient(180deg, rgba(255, 244, 180, 0.1), rgba(8, 27, 27, 0.76)),
    rgba(35, 59, 39, 0.68);
  color: rgba(255, 251, 235, 0.96);
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.skill-option:hover:not(:disabled) {
  border-color: rgba(250, 204, 21, 0.64);
  background:
    linear-gradient(180deg, rgba(255, 244, 180, 0.16), rgba(11, 39, 33, 0.82)),
    rgba(55, 83, 45, 0.76);
  transform: translateY(-1px);
}

.skill-option:disabled {
  opacity: 0.78;
  cursor: not-allowed;
}

.skill-option-code {
  width: 1.3rem;
  height: 1.3rem;
  margin-top: 0.04rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.18);
  font-size: 0.52rem;
  font-weight: 900;
  line-height: 1;
}

.skill-option-copy {
  min-width: 0;
  display: grid;
  gap: 0.18rem;
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
  font-size: 0.68rem;
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
.skill-option-effect,
.skill-option-examples,
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

.skill-option-effect {
  color: rgba(190, 242, 100, 0.9);
}

.skill-option-examples {
  color: rgba(203, 213, 225, 0.82);
}

.skill-option-segments {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.16rem;
  padding: 0.18rem;
  border: 1px solid rgba(255, 251, 235, 0.12);
  border-radius: 0.32rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.2)),
    rgba(8, 13, 16, 0.36);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

.skill-option-segment {
  min-width: 0;
  height: 0.58rem;
  border: 1px solid rgba(255, 251, 235, 0.1);
  border-radius: 0.08rem;
  background: rgba(15, 23, 42, 0.35);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 -1px 0 rgba(0, 0, 0, 0.22) inset;
}

.skill-option-segment-filled {
  border-color: rgba(134, 239, 172, 0.34);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(0, 0, 0, 0.12)),
    color-mix(in srgb, var(--hero-accent) 48%, rgba(34, 197, 94, 0.64));
  box-shadow:
    0 0 8px color-mix(in srgb, var(--hero-accent) 32%, transparent),
    0 1px 0 rgba(255, 255, 255, 0.12) inset;
}

.skill-option-segment-next {
  border-color: rgba(250, 204, 21, 0.52);
  background:
    linear-gradient(180deg, rgba(250, 204, 21, 0.28), rgba(161, 98, 7, 0.22)),
    rgba(15, 23, 42, 0.35);
}

.skill-option-state {
  grid-column: 2;
  align-self: end;
  justify-self: start;
  margin-top: 0.08rem;
  white-space: nowrap;
  color: rgba(250, 204, 21, 0.95);
}

@media (max-width: 640px) {
  .heroes-bar {
    bottom: 3.3rem;
    height: 13.55rem;
  }

  .heroes-avatar-strip {
    --mobile-card-width: min(76vw, 11.8rem);
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 13.4rem;
    pointer-events: auto;
    align-items: flex-end;
    gap: 0;
    overflow-x: auto;
    overflow-y: visible;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: calc((100vw - var(--mobile-card-width)) / 2);
    padding: 1rem calc((100vw - var(--mobile-card-width)) / 2) 0.55rem;
    touch-action: pan-x;
    overscroll-behavior-x: contain;
    background:
      linear-gradient(to top, rgba(4, 10, 12, 0.7), rgba(4, 10, 12, 0.18) 58%, transparent),
      radial-gradient(ellipse at 50% 100%, rgba(0, 0, 0, 0.34), transparent 70%);
  }

  .hero-card {
    flex: 0 0 var(--mobile-card-width);
    width: var(--mobile-card-width);
    height: 11.85rem;
    margin-left: 0.55rem;
    scroll-snap-align: center;
    scroll-snap-stop: always;
  }

  .hero-card:first-child {
    margin-left: 0;
  }

  .hero-card-tucked {
    z-index: 1;
    transform: translateY(1.2rem) rotate(var(--hero-card-rotation)) scale(0.93);
    filter: saturate(0.82) brightness(0.82);
  }

  .hero-card-tucked:hover {
    transform: translateY(0.88rem) rotate(calc(var(--hero-card-rotation) * 0.55)) scale(0.96);
  }

  .hero-card-selected {
    z-index: 6;
    transform: translateY(-0.16rem) rotate(0deg) scale(1);
  }

  .hero-card-controls {
    min-height: 2.55rem;
  }

  .scout-menu-trigger,
  .skill-menu-trigger {
    min-height: 2.1rem;
  }

  .hero-floating-menu.scout-menu {
    width: min(18rem, calc(100vw - 1rem)) !important;
  }

  .hero-floating-menu.skill-menu {
    width: min(25rem, calc(100vw - 1rem)) !important;
    max-height: min(28rem, calc(100vh - 0.75rem));
    gap: 0.32rem;
    padding: 0.38rem;
  }

  .skill-menu-title {
    font-size: 0.62rem;
  }

  .skill-menu-points {
    font-size: 0.5rem;
  }

  .skill-option {
    min-height: 5.95rem;
    padding: 0.38rem;
    gap: 0.32rem;
  }

  .skill-option-code {
    width: 1.1rem;
    height: 1.1rem;
    font-size: 0.46rem;
  }

  .skill-option-label {
    font-size: 0.58rem;
  }

  .skill-option-level,
  .skill-option-summary,
  .skill-option-effect,
  .skill-option-examples,
  .skill-option-state {
    font-size: 0.48rem;
  }

  .skill-option-segments {
    gap: 0.1rem;
    padding: 0.12rem;
  }

  .skill-option-segment {
    height: 0.42rem;
  }
}

.heroes-sheet-enter-active, .heroes-sheet-leave-active { transition: transform .18s ease; }
.heroes-sheet-enter-from, .heroes-sheet-leave-to { transform: translateY(80px); }
.heroes-sheet-enter-to, .heroes-sheet-leave-from { transform: translateY(0); }
.hero-bubble-enter-active, .hero-bubble-leave-active { transition: transform .18s ease; }
.hero-bubble-enter-from, .hero-bubble-leave-to { transform: translateY(200px); }
.hero-bubble-enter-to, .hero-bubble-leave-from { transform: translateY(0); }
</style>

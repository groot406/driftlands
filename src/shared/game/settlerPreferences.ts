import type { DrinkPreference, SettlerTrait } from '../../core/types/Settler.ts';

type SettlerProfileLike = {
  id: string;
  appearanceSeed?: number;
  nameSeed?: number;
  drinkPreference?: DrinkPreference;
  traits?: SettlerTrait[];
};

type SocialDrinkType = 'beer' | 'wine';

interface TraitDefinition {
  key: SettlerTrait;
  label: string;
}

interface PreferenceDefinition {
  key: DrinkPreference;
  label: string;
}

const TRAIT_DEFINITIONS: readonly TraitDefinition[] = [
  { key: 'long_worker', label: 'Long Worker' },
  { key: 'short_worker', label: 'Short Worker' },
  { key: 'light_sleeper', label: 'Light Sleeper' },
  { key: 'heavy_sleeper', label: 'Heavy Sleeper' },
  { key: 'social', label: 'Social' },
  { key: 'independent', label: 'Independent' },
  { key: 'easy_to_please', label: 'Easy To Please' },
  { key: 'hard_to_please', label: 'Hard To Please' },
  { key: 'big_eater', label: 'Big Eater' },
  { key: 'small_eater', label: 'Small Eater' },
] as const;

const PREFERENCE_DEFINITIONS: readonly PreferenceDefinition[] = [
  { key: 'beer', label: 'Beer' },
  { key: 'wine', label: 'Wine' },
  { key: 'either', label: 'Either' },
] as const;

export const SETTLER_TRAITS = TRAIT_DEFINITIONS.map((trait) => trait.key);
export const DRINK_PREFERENCES = PREFERENCE_DEFINITIONS.map((preference) => preference.key);

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getProfileSeed(profile: SettlerProfileLike, salt: string) {
  return hashString(`${profile.id}:${profile.appearanceSeed ?? 0}:${profile.nameSeed ?? 0}:${salt}`);
}

function isSettlerTrait(value: string): value is SettlerTrait {
  return SETTLER_TRAITS.includes(value as SettlerTrait);
}

function isDrinkPreference(value: string): value is DrinkPreference {
  return DRINK_PREFERENCES.includes(value as DrinkPreference);
}

export function normalizeSettlerTraits(profile: SettlerProfileLike): SettlerTrait[] {
  const normalized = (profile.traits ?? []).filter(isSettlerTrait);
  if (normalized.length > 0) {
    return Array.from(new Set(normalized)).slice(0, 2);
  }

  return [SETTLER_TRAITS[getProfileSeed(profile, 'trait') % SETTLER_TRAITS.length] ?? 'long_worker'];
}

export function normalizeDrinkPreference(profile: SettlerProfileLike): DrinkPreference {
  if (profile.drinkPreference && isDrinkPreference(profile.drinkPreference)) {
    return profile.drinkPreference;
  }

  return DRINK_PREFERENCES[getProfileSeed(profile, 'drink') % DRINK_PREFERENCES.length] ?? 'either';
}

export function hasSettlerTrait(profile: SettlerProfileLike, trait: SettlerTrait) {
  return normalizeSettlerTraits(profile).includes(trait);
}

export function getSettlerTraitLabel(trait: SettlerTrait) {
  return TRAIT_DEFINITIONS.find((definition) => definition.key === trait)?.label ?? trait;
}

export function getDrinkPreferenceLabel(preference: DrinkPreference) {
  return PREFERENCE_DEFINITIONS.find((definition) => definition.key === preference)?.label ?? preference;
}

export function getSettlerHungerRateMultiplier(profile: SettlerProfileLike) {
  if (hasSettlerTrait(profile, 'big_eater')) {
    return 1.25;
  }
  if (hasSettlerTrait(profile, 'small_eater')) {
    return 0.8;
  }

  return 1;
}

export function getSettlerWorkFatigueMultiplier(profile: SettlerProfileLike) {
  if (hasSettlerTrait(profile, 'long_worker')) {
    return 0.8;
  }
  if (hasSettlerTrait(profile, 'short_worker')) {
    return 1.25;
  }

  return 1;
}

export function getSettlerSleepDurationMultiplier(profile: SettlerProfileLike) {
  if (hasSettlerTrait(profile, 'light_sleeper')) {
    return 0.75;
  }
  if (hasSettlerTrait(profile, 'heavy_sleeper')) {
    return 1.35;
  }

  return 1;
}

export function getSettlerSleepThresholdMultiplier(profile: SettlerProfileLike) {
  if (hasSettlerTrait(profile, 'light_sleeper')) {
    return 1.15;
  }
  if (hasSettlerTrait(profile, 'heavy_sleeper')) {
    return 0.85;
  }

  return 1;
}

export function getSettlerHappinessDecayMultiplier(profile: SettlerProfileLike) {
  if (hasSettlerTrait(profile, 'social')) {
    return 1.35;
  }
  if (hasSettlerTrait(profile, 'independent')) {
    return 0.65;
  }

  return 1;
}

export function getSettlerSocialThreshold(profile: SettlerProfileLike) {
  if (hasSettlerTrait(profile, 'social')) {
    return 85;
  }
  if (hasSettlerTrait(profile, 'independent')) {
    return 60;
  }

  return 75;
}

export function getSettlerDrinkPriority(profile: SettlerProfileLike): readonly SocialDrinkType[] {
  const preference = normalizeDrinkPreference(profile);
  switch (preference) {
    case 'beer':
      return ['beer', 'wine'];
    case 'wine':
      return ['wine', 'beer'];
    default:
      return ['beer', 'wine'];
  }
}

export function getSettlerDrinkHappinessGain(profile: SettlerProfileLike, drinkType: SocialDrinkType) {
  const preference = normalizeDrinkPreference(profile);
  let gain = 20;

  if (preference === 'beer') {
    gain = drinkType === 'beer' ? 25 : 15;
  } else if (preference === 'wine') {
    gain = drinkType === 'wine' ? 30 : 15;
  } else {
    gain = drinkType === 'wine' ? 25 : 20;
  }

  if (hasSettlerTrait(profile, 'easy_to_please')) {
    gain += 5;
  } else if (hasSettlerTrait(profile, 'hard_to_please')) {
    gain -= 5;
  }

  if (hasSettlerTrait(profile, 'social')) {
    gain += 3;
  }

  return Math.max(5, gain);
}

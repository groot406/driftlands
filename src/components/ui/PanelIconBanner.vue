<template>
  <span
    class="panel-icon-banner"
    :class="[colorClass, `panel-icon-banner--${props.size}`, { 'panel-icon-banner--uses-baked-icon': usesBakedIcon }]"
    :style="bannerStyle"
    aria-hidden="true"
  >
    <span v-if="!usesBakedIcon" class="panel-icon-banner__patch" aria-hidden="true"></span>
    <span v-if="!usesBakedIcon" class="panel-icon-banner__icon">
      <slot>{{ props.icon }}</slot>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, type CSSProperties, useSlots } from 'vue';

import badgeStarUrl from '../../assets/ui/settler-modal/badge-star.png';
import bannerBuildUrl from '../../assets/ui/settler-modal/banner-build.png';
import bannerHomeUrl from '../../assets/ui/settler-modal/banner-home.png';

type BannerColor = 'purple' | 'red' | 'green' | 'blue' | 'gold';
type BannerVariant = 'home' | 'build' | 'star';

const props = withDefaults(defineProps<{
  icon?: string;
  color?: BannerColor | string;
  size?: 'tab' | 'badge';
  variant?: BannerVariant;
}>(), {
  icon: '★',
  color: 'purple',
  size: 'tab',
});

const slots = useSlots();
const knownColors = new Set(['purple', 'red', 'green', 'blue', 'gold']);
const hasCustomIconSlot = computed(() => Boolean(slots.default));
const isHomeIcon = computed(() => ['⌂', '🏠', 'home'].includes(props.icon ?? ''));
const isBuildIcon = computed(() => ['⚒', '🛠', '🛠️', 'build', 'tools'].includes(props.icon ?? ''));
const isStarIcon = computed(() => ['★', '☆'].includes(props.icon ?? ''));
const resolvedVariant = computed<BannerVariant>(() => {
  if (props.variant) return props.variant;
  if (props.size === 'badge') return 'star';
  if (isBuildIcon.value) return 'build';
  return 'home';
});
const usesBakedIcon = computed(() => !hasCustomIconSlot.value && (
  (props.size === 'tab' && isHomeIcon.value) ||
  (props.size === 'tab' && isBuildIcon.value) ||
  (props.size === 'badge' && isStarIcon.value)
));
const colorClass = computed(() => knownColors.has(props.color ?? 'purple') ? `panel-icon-banner--${props.color ?? 'purple'}` : 'panel-icon-banner--custom');
const bannerStyle = computed<CSSProperties>(() => {
  const imageUrl = resolvedVariant.value === 'build'
    ? bannerBuildUrl
    : resolvedVariant.value === 'star'
      ? badgeStarUrl
      : bannerHomeUrl;
  const style: CSSProperties = {
    backgroundImage: `url(${imageUrl})`,
  };

  if (!props.color || knownColors.has(props.color)) {
    return style;
  }

  return {
    ...style,
    '--banner-tint': props.color,
    '--banner-tint-opacity': 0.42,
  } as CSSProperties;
});
</script>

<script lang="ts">
export default { name: 'PanelIconBanner' };
</script>

<style scoped>
.panel-icon-banner {
  --banner-tint: transparent;
  --banner-tint-opacity: 0;
  position: relative;
  width: 3.55rem;
  height: 5.75rem;
  display: block;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  filter: drop-shadow(0 8px 10px rgba(0, 0, 0, 0.45));
}

.panel-icon-banner--badge {
  width: 2.85rem;
  height: 4.05rem;
}

.panel-icon-banner--red {
  --banner-tint: #842d2f;
  --banner-tint-opacity: 0.5;
}

.panel-icon-banner--green {
  --banner-tint: #315b39;
  --banner-tint-opacity: 0.48;
}

.panel-icon-banner--blue {
  --banner-tint: #314c82;
  --banner-tint-opacity: 0.48;
}

.panel-icon-banner--gold {
  --banner-tint: #986225;
  --banner-tint-opacity: 0.42;
}

.panel-icon-banner::after {
  content: '';
  position: absolute;
  inset: 1.02rem 0.86rem 1.1rem;
  background:
    radial-gradient(circle at 50% 32%, rgba(255, 255, 255, 0.12), transparent 42%),
    var(--banner-tint);
  clip-path: polygon(0 0, 100% 0, 100% 72%, 50% 100%, 0 72%);
  mix-blend-mode: color;
  opacity: var(--banner-tint-opacity);
  pointer-events: none;
  z-index: 1;
}

.panel-icon-banner--badge::after {
  inset: 0.58rem 0.68rem 0.65rem;
}

.panel-icon-banner--purple::after {
  opacity: 0;
}

.panel-icon-banner__patch {
  position: absolute;
  left: 27%;
  right: 27%;
  top: 35%;
  bottom: 28%;
  background:
    radial-gradient(circle at 42% 28%, rgba(126, 72, 153, 0.56), transparent 46%),
    linear-gradient(180deg, rgba(56, 27, 82, 0.98), rgba(38, 20, 59, 0.98));
  border-radius: 0.18rem;
  box-shadow:
    inset 0 0 0 1px rgba(228, 167, 79, 0.12),
    inset 0 -0.35rem 0.7rem rgba(0, 0, 0, 0.22);
  pointer-events: none;
  z-index: 2;
}

.panel-icon-banner--badge .panel-icon-banner__patch {
  left: 28%;
  right: 28%;
  top: 30%;
  bottom: 26%;
}

.panel-icon-banner__icon {
  position: absolute;
  left: 50%;
  top: 51%;
  z-index: 3;
  color: #e1b75a;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: var(--panel-banner-icon-size, 1.65rem);
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 2px 0 #150b09, 0 0 8px rgba(227, 173, 69, 0.24);
  transform: translate(-50%, -50%);
}

.panel-icon-banner--badge .panel-icon-banner__icon {
  top: 48%;
  font-size: var(--panel-banner-icon-size, 1.42rem);
}
</style>

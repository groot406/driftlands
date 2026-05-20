<template>
  <component
    :is="as"
    class="panel-modal-shell smooth-modal-surface relative"
    :class="{ 'panel-modal-shell--with-header': hasHeader }"
    @click.stop
  >
    <div v-if="showClose" class="panel-modal-chrome">
      <PanelCloseButton
        :title="closeTitle"
        :aria-label="closeAriaLabel"
        @click="$emit('close', $event)"
      />
    </div>
    <header
      v-if="hasHeader"
      class="panel-modal-header"
      :class="{ 'panel-modal-header--no-banner': !showHeaderBanner }"
    >
      <PanelIconBanner
        v-if="showHeaderBanner"
        class="panel-modal-header__banner"
        :icon="headerIcon"
        :color="headerIconColor"
        :variant="headerIconVariant"
      />
      <div ref="headerCopyEl" class="panel-modal-header__copy">
        <p v-if="headerLabel" class="panel-modal-header__label">{{ headerLabel }}</p>
        <component
          :is="headerTitleTag"
          v-if="headerTitle"
          ref="headerTitleEl"
          class="panel-modal-header__title"
        >
          {{ headerTitle }}
        </component>
      </div>
      <slot name="header-extra" />
    </header>
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import PanelCloseButton from './PanelCloseButton.vue';
import PanelIconBanner from './PanelIconBanner.vue';

type HeaderIconVariant = 'home' | 'build' | 'star';

const props = withDefaults(defineProps<{
  as?: string;
  showClose?: boolean;
  closeTitle?: string;
  closeAriaLabel?: string;
  headerLabel?: string;
  headerTitle?: string;
  headerTitleTag?: string;
  headerIcon?: string;
  headerIconColor?: string;
  headerIconVariant?: HeaderIconVariant;
  showHeaderIcon?: boolean;
}>(), {
  as: 'section',
  showClose: true,
  closeTitle: 'Close',
  closeAriaLabel: 'Close panel',
  headerTitleTag: 'h2',
  headerIcon: '⌂',
  headerIconColor: 'purple',
  headerIconVariant: 'home',
  showHeaderIcon: true,
});

defineEmits<{
  close: [event: MouseEvent];
}>();

const hasHeader = computed(() => Boolean(props.headerLabel || props.headerTitle));
const showHeaderBanner = computed(() => props.showHeaderIcon && hasHeader.value);

const headerCopyEl = ref<HTMLElement | null>(null);
const headerTitleEl = ref<HTMLElement | null>(null);

let resizeObserver: ResizeObserver | null = null;
let fitFrame = 0;

function fitHeaderTitle() {
  const copyEl = headerCopyEl.value;
  const titleEl = headerTitleEl.value;

  if (!copyEl || !titleEl) return;

  titleEl.style.fontSize = '';

  const availableWidth = copyEl.clientWidth;
  const naturalWidth = titleEl.scrollWidth;
  const baseFontSize = Number.parseFloat(window.getComputedStyle(titleEl).fontSize);

  if (availableWidth <= 0 || naturalWidth <= 0 || baseFontSize <= 0 || naturalWidth <= availableWidth) {
    return;
  }

  const nextFontSize = Math.max(11, baseFontSize * (availableWidth / naturalWidth));
  titleEl.style.fontSize = `${nextFontSize}px`;

  if (titleEl.scrollWidth > availableWidth) {
    const correction = availableWidth / titleEl.scrollWidth;
    titleEl.style.fontSize = `${Math.max(10, nextFontSize * correction)}px`;
  }
}

function scheduleHeaderTitleFit() {
  if (typeof window === 'undefined') return;
  window.cancelAnimationFrame(fitFrame);
  fitFrame = window.requestAnimationFrame(() => {
    void nextTick(fitHeaderTitle);
  });
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleHeaderTitleFit);
    if (headerCopyEl.value) resizeObserver.observe(headerCopyEl.value);
  }
  window.addEventListener('resize', scheduleHeaderTitleFit);
  scheduleHeaderTitleFit();
});

watch(
  () => [props.headerTitle, props.headerLabel, props.showHeaderIcon, props.headerIconVariant],
  scheduleHeaderTitleFit,
  { flush: 'post' },
);

onBeforeUnmount(() => {
  window.cancelAnimationFrame(fitFrame);
  window.removeEventListener('resize', scheduleHeaderTitleFit);
  resizeObserver?.disconnect();
});
</script>

<script lang="ts">
export default { name: 'PanelModalShell' };
</script>

<style scoped>
.panel-modal-shell {
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
  border: var(--panel-modal-border-width, 20px) solid transparent;
  border-image: url('../../assets/ui/settler-modal/panel-frame.png') 72 / var(--panel-modal-border-image-width, 36px) stretch;
  background: var(
    --panel-modal-background,
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, #121619 0%, #0a0d10 100%)
  );
  color: var(--panel-modal-color, #f3e4c9);
  box-shadow: var(
    --panel-modal-shadow,
    0 28px 80px rgba(0, 0, 0, 0.66),
    inset 0 0 64px rgba(0, 0, 0, 0.82)
  );
}

.panel-modal-chrome {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 10;
  height: 0;
  pointer-events: none;
}

.panel-modal-chrome :deep(.panel-close-button) {
  pointer-events: auto;
}

.panel-modal-header {
  position: relative;
  z-index: 2;
  grid-column: 1 / -1;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  box-sizing: border-box;
  height: var(--panel-header-height, 5.55rem);
  min-height: 0;
  margin: var(--panel-header-margin, 0 calc(-1 * var(--panel-modal-border-width, 20px)) 0 calc(-1 * var(--panel-modal-border-width, 20px)));
  padding: var(--panel-header-padding, 1.15rem 4rem 0.72rem 6.05rem);
  border-bottom: var(--panel-header-border, 1px solid rgba(139, 93, 43, 0.5));
  background: var(
    --panel-header-background,
    radial-gradient(circle at 20% 0%, rgba(102, 71, 37, 0.16), transparent 18rem),
    linear-gradient(180deg, rgba(25, 20, 15, 0.34), rgba(8, 9, 10, 0.08))
  );
  box-shadow: var(--panel-header-shadow, inset 0 -1px 0 rgba(255, 226, 161, 0.035));
  overflow: visible;
}

.panel-modal-header--no-banner {
  padding-left: var(--panel-header-padding-left-without-banner, 0);
}

.panel-modal-header__banner {
  position: absolute;
  top: var(--panel-header-banner-top, -0.15rem);
  left: var(--panel-header-banner-left, 1.05rem);
  z-index: 3;
  width: var(--panel-header-banner-width, 3.9rem);
  height: var(--panel-header-banner-height, 6.3rem);
}

.panel-modal-header__copy {
  min-width: 0;
  flex: 1;
}

.panel-modal-header__label {
  margin: 0 0 0.18rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: var(--panel-header-label-size, 0.64rem);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--panel-header-label-color, #c99a4b);
  text-shadow: 0 1px 0 #070706;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}

.panel-modal-header__title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: var(--panel-header-title-size, clamp(1.8rem, 2.75vw, 2.35rem));
  font-weight: 700;
  line-height: 1.1;
  color: var(--panel-header-title-color, #fff1d4);
  text-shadow: 0 2px 0 #090807, 0 0 10px rgba(216, 170, 83, 0.16);
  max-width: 100%;
  overflow: visible;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .panel-modal-shell {
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    --panel-modal-border-width: var(--panel-modal-mobile-border-width, 16px);
    --panel-modal-border-image-width: var(--panel-modal-mobile-border-image-width, 28px);
  }
}
</style>

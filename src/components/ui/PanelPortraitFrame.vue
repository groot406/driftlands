<template>
  <figure class="panel-portrait-frame" :class="`panel-portrait-frame--${glow}`" :style="frameStyle">
    <div v-if="glow !== 'none'" class="panel-portrait-frame__glow" aria-hidden="true"></div>
    <slot>
      <div v-if="imageStyle" class="panel-portrait-frame__image" :style="imageStyle" aria-hidden="true"></div>
    </slot>
  </figure>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';

const props = withDefaults(defineProps<{
  imageStyle?: CSSProperties;
  aspectRatio?: string;
  maxWidth?: string;
  glow?: 'purple' | 'gold' | 'none';
}>(), {
  aspectRatio: '1 / 1.16',
  maxWidth: '11.95rem',
  glow: 'purple',
});

const frameStyle = computed<CSSProperties>(() => ({
  '--panel-portrait-aspect-ratio': props.aspectRatio,
  '--panel-portrait-max-width': props.maxWidth,
} as CSSProperties));
</script>

<script lang="ts">
export default { name: 'PanelPortraitFrame' };
</script>

<style scoped>
.panel-portrait-frame {
  position: relative;
  box-sizing: border-box;
  width: min(100%, var(--panel-portrait-max-width));
  aspect-ratio: var(--panel-portrait-aspect-ratio);
  margin: 0 auto;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 12px solid transparent;
  border-image: url('../../assets/ui/settler-modal/info-panel.png') 58 / 12px stretch;
  background: #120f18;
  box-shadow:
    0 8px 22px rgba(0, 0, 0, 0.54),
    inset 0 0 26px rgba(0, 0, 0, 0.74);
}

.panel-portrait-frame__glow {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.panel-portrait-frame--purple .panel-portrait-frame__glow {
  background:
    radial-gradient(circle at 50% 18%, rgba(142, 84, 164, 0.28), transparent 58%),
    linear-gradient(180deg, transparent 62%, rgba(0, 0, 0, 0.34));
}

.panel-portrait-frame--gold .panel-portrait-frame__glow {
  background:
    radial-gradient(circle at 50% 22%, rgba(216, 170, 83, 0.24), transparent 56%),
    linear-gradient(180deg, transparent 58%, rgba(0, 0, 0, 0.34));
}

.panel-portrait-frame__image {
  position: absolute;
  inset: -1px;
  z-index: 0;
  background-repeat: no-repeat;
  background-size: 500% 100%;
  image-rendering: auto;
}
</style>

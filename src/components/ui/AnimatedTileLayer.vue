<template>
  <img
    v-if="!normalizedAnimation"
    v-bind="attrs"
    :src="src"
    :alt="alt"
    :style="layerStyle"
  >
  <span
    v-else
    v-bind="attrs"
    class="tile-spritesheet-frame"
    :style="layerStyle"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
  >
    <span class="tile-spritesheet-frame__sheet" :style="sheetStyle"></span>
  </span>
</template>

<script setup lang="ts">
import { computed, useAttrs, type CSSProperties } from 'vue';

import type { TileAnimationDef } from '../../core/terrainDefs.ts';
import { normalizeTileAnimation } from '../../core/tileAnimation.ts';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<{
  src: string;
  alt?: string;
  animation?: TileAnimationDef | null;
  layerStyle?: CSSProperties | CSSProperties[] | string;
}>(), {
  alt: '',
  animation: null,
  layerStyle: undefined,
});

const attrs = useAttrs();
const normalizedAnimation = computed(() => normalizeTileAnimation(props.animation));
const sheetStyle = computed<CSSProperties>(() => {
  const animation = normalizedAnimation.value;
  if (!animation) {
    return {};
  }

  const escapedSrc = props.src.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return {
    '--tile-layer-frame-count': String(animation.frames),
    backgroundImage: `url("${escapedSrc}")`,
  } as CSSProperties;
});
</script>

<style scoped>
.tile-spritesheet-frame {
  display: block;
  overflow: hidden;
}

.tile-spritesheet-frame__sheet {
  position: absolute;
  inset: 0 auto 0 0;
  width: calc(var(--tile-layer-frame-count) * 100%);
  height: 100%;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  image-rendering: pixelated;
  transform: translateX(0);
}
</style>

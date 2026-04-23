<template>
  <component :is="as" class="nine-slice-frame" :class="classes" :style="frameStyle">
    <div :class="contentClass"><slot/></div>
  </component>
</template>

<script setup lang="ts">
import {computed} from 'vue';

type BorderImageRepeat = 'stretch' | 'repeat' | 'round' | 'space';

const props = withDefaults(defineProps<{
  imagePath: string;
  slice: number | string;
  borderWidth: number | string;
  repeat?: BorderImageRepeat;
  fill?: boolean;
  pixelated?: boolean;
  as?: string;
  contentClass?: string;
}>(), {
  repeat: 'stretch',
  fill: false,
  pixelated: false,
  as: 'div',
});

const cssLength = (value: number | string) => {
  if (typeof value === 'number') {
    return `${value}px`;
  }
  return value;
};

const frameStyle = computed(() => {
  const borderWidth = cssLength(props.borderWidth);
  const source = `url(${JSON.stringify(props.imagePath)})`;
  return {
    '--nine-slice-width': borderWidth,
    '--nine-slice-source': source,
    '--nine-slice-slice': `${props.slice}${props.fill ? ' fill' : ''}`,
    '--nine-slice-repeat': props.repeat,
  } as Record<string, string>;
});

const classes = computed(() => ({
  'nine-slice-frame--pixelated': props.pixelated,
}));
</script>

<script lang="ts">
export default {name: 'NineSliceFrame'};
</script>

<style scoped>
.nine-slice-frame {
  position: relative;
  isolation: isolate;
  display: block;
  min-width: calc(var(--nine-slice-width) + var(--nine-slice-width));
  min-height: calc(var(--nine-slice-width) + var(--nine-slice-width));
  border: 0;
}

.nine-slice-frame--pixelated {
  image-rendering: pixelated;
}

.nine-slice-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border: var(--nine-slice-width) solid transparent;
  border-image-source: var(--nine-slice-source);
  border-image-slice: var(--nine-slice-slice);
  border-image-width: var(--nine-slice-width);
  border-image-repeat: var(--nine-slice-repeat);
  pointer-events: none;
}
</style>

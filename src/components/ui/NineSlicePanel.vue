<template>
  <NineSliceFrame
    v-bind="$attrs"
    :as="as"
    class="ui-nine-slice-panel text-opacity-75 drop-shadow-2xl"
    :class="`ui-nine-slice-panel--${type}`"
    :image-path="panelImageUrl"
    :slice="type === 'small' ? 16 : 37"
    :border-width="type === 'small' ? 25 : 32"
    repeat="stretch"
    fill
    :pixelated="true"
    content-class="p-3 px-1"
  >
    <slot/>
  </NineSliceFrame>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import panelDarkUrl from '../../assets/ui/frames/panel-dark.png';
import panelParchmentUrl from '../../assets/ui/frames/panel-parchment.png';
import panelWoodUrl from '../../assets/ui/frames/panel-wood.png';
import panelSmall from '../../assets/ui/buttons/button-frame.png'
import NineSliceFrame from './NineSliceFrame.vue';

type NineSlicePanelType = 'dark' | 'parchment' | 'wood' | 'small';

const panelImages: Record<NineSlicePanelType, string> = {
  dark: panelDarkUrl,
  parchment: panelParchmentUrl,
  wood: panelWoodUrl,
  small: panelSmall,
};

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<{
  type?: NineSlicePanelType;
  as?: string;
}>(), {
  type: 'wood',
  as: 'div',
});

const panelImageUrl = computed(() => panelImages[props.type]);
</script>

<script lang="ts">
export default {name: 'NineSlicePanel'};
</script>

<style scoped>
.ui-nine-slice-panel {
  color: rgb(48, 35, 22);
}

.ui-nine-slice-panel--wood {
  filter: drop-shadow(0 12px 18px rgba(4, 8, 7, 0.34));
}

.ui-nine-slice-panel--dark {
  color: rgb(229, 231, 235);
  filter: drop-shadow(0 14px 24px rgba(2, 6, 23, 0.5));
}

.ui-nine-slice-panel--parchment {
  color: rgb(54, 38, 24);
  filter: drop-shadow(0 12px 18px rgba(59, 37, 18, 0.28));
}
</style>

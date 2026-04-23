<template>
  <NineSliceFrame
    v-bind="$attrs"
    as="button"
    class="ui-nine-slice-button"
    :image-path="buttonFrameUrl"
    :slice="16"
    :border-width="25"
    repeat="stretch"
    fill
    pixelated
    :type="type"
    :disabled="disabled"
  >
    <span class="ui-nine-slice-button__content text-yellow-50/50 hover:text-yellow-50">
      <slot/>
    </span>
  </NineSliceFrame>
</template>

<script setup lang="ts">
import buttonFrameUrl from '../../assets/ui/buttons/button-frame.png';
import NineSliceFrame from './NineSliceFrame.vue';

defineOptions({
  inheritAttrs: false,
});

withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>(), {
  type: 'button',
  disabled: false,
});
</script>

<script lang="ts">
export default {name: 'NineSliceButton'};
</script>

<style scoped>
.ui-nine-slice-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 7rem;
  min-height: 3.25rem;
  padding: 0;
  color: rgb(54, 34, 18);
  font: inherit;
  text-align: center;
  background: transparent;
  cursor: pointer;
  user-select: none;
  transition:
    filter 120ms ease,
    transform 80ms ease;
}

.ui-nine-slice-button:hover:not(:disabled) {
  filter: brightness(1.08);
}

.ui-nine-slice-button:active:not(:disabled) {
  transform: translateY(1px);
  filter: brightness(0.96);
}

.ui-nine-slice-button:focus-visible {
  outline: 2px solid rgba(255, 244, 181, 0.95);
  outline-offset: 2px;
}

.ui-nine-slice-button:disabled {
  cursor: not-allowed;
  filter: grayscale(0.4) brightness(0.78);
}

.ui-nine-slice-button__content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 100%;
  padding: 0.15rem 0.65rem;
  pointer-events: none;
}
</style>

<template>
  <div class="flex items-center justify-center" :class="{'-scale-x-100' : flipped }" :style="containerStyle">
    <div class="sprite" :style="style"/>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";

const props = defineProps({
  sprite: {type: String, required: true},
  size: {type: Number, required: false},
  width: {type: Number, required: false},
  height: {type: Number, required: false},

  zoom: {type: Number, required: true},
  row: {type: Number, required: true},
  offsetX: {type: Number, required: null},
  offsetY: {type: Number, required: null},
  flipped: {type: Boolean, required: null, default: false},
  frame: {type: Number, required: null, default: null},
  frames: {type: Number, required: null, default: null},
  speed: {type: Number, required: null, default: null},
  cooldown: {type: Number, required: null, default: null},
  paused: {type: Boolean, required: null, default: false},
});

const dimensions = computed(() => {
  if (props.size) {
    return {width: props.size, height: props.size};
  }
  return {
    width: props.width ?? 0,
    height: props.height ?? 0,
  };
});

const innerFrame = ref(0);
let frameTimer = null;
let cooldownInProgress = false;
onMounted(startAnimation);

function startAnimation() {
  if (props.frame === null && props.frames) {
    if (frameTimer) {
      clearInterval(frameTimer);
    }
    frameTimer = setInterval(() => {
      if (props.paused) {
        return;
      }
      if (cooldownInProgress) {
        return;
      }
      if (innerFrame.value === props.frames - 1) {
        if (props.cooldown) {
          cooldownInProgress = true;
          setTimeout(() => {
            cooldownInProgress = false;
          }, props.cooldown);
        }
        innerFrame.value = 0;
      } else {
        innerFrame.value++;
      }
    }, props.speed);
  }
}

watch(() => props.paused, () => {
  if (props.paused && frameTimer) {
    clearInterval(frameTimer);
    return;
  }
  if (!props.paused) {
    startAnimation();
  }
});

watch(() => props.speed, () => {
  startAnimation();
});

const style = computed(() => {
  const renderFrame = (props.frame !== null) ? props.frame : innerFrame.value;
  return {
    backgroundImage: 'url(' + props.sprite + ')',
    width: dimensions.value.width + 'px',
    height: dimensions.value.height + 'px',
    overflow: 'hidden',
    // Use transform for broad browser support
    transform: `scale(${props.zoom})`,
    transformOrigin: 'top left',
    backgroundPositionX: (renderFrame * dimensions.value.width * -1) + 'px',
    backgroundPositionY: (props.row * dimensions.value.height * -1) + 'px'
  };
});

const containerStyle = computed(() => {
  const baseW = dimensions.value.width * props.zoom;
  const baseH = dimensions.value.height * props.zoom;
  const style: Record<string, string> = {
    width: baseW + 'px',
    height: baseH + 'px',
    position: 'relative'
  };
  if (props.offsetX !== undefined && props.offsetX !== null && props.size) {
    style.top = '-' + (props.size - props.offsetX) * props.zoom + 'px';
  }
  if (props.offsetY !== undefined && props.offsetY !== null && props.size) {
    style.left = '-' + (props.size - props.offsetY) * props.zoom + 'px';
  }
  return style;
});

</script>



<style>
.sprite {
  image-rendering: optimizeSpeed; /* STOP SMOOTHING, GIVE ME SPEED  */
  image-rendering: -moz-crisp-edges; /* Firefox                        */
  image-rendering: -o-crisp-edges; /* Opera                          */
  image-rendering: -webkit-optimize-contrast; /* Chrome (and eventually Safari) */
  image-rendering: pixelated; /* Universal support since 2021   */
  image-rendering: optimize-contrast; /* CSS3 Proposed                  */
  -ms-interpolation-mode: nearest-neighbor; /* IE8+                           */
}
</style>
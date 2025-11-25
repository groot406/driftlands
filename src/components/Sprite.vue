<template>
  <div class="flex items-center justify-center" :class="{'-scale-x-100' : flipped }" :style="containerStyle">
    <div class="sprite pixel-art" :style="style"/>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";

interface SpriteProps {
  sprite: string;
  size?: number;
  width?: number;
  height?: number;
  zoom: number;
  row: number;
  offsetX?: number | null;
  offsetY?: number | null;
  flipped?: boolean;
  frame?: number | null;
  frames?: number | null;
  speed?: number | null; // ms per frame
  cooldown?: number | null; // ms after one cycle
  paused?: boolean | null;
}

const props = defineProps<SpriteProps>();

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
let frameTimer: ReturnType<typeof setInterval> | null = null;
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
      if (innerFrame.value === props.frames! - 1) {
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
    }, props.speed || 500);
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
  const renderFrame = (props.frame !== null && props.frame !== undefined) ? props.frame : innerFrame.value;
  return {
    backgroundImage: 'url(' + props.sprite + ')',
    width: dimensions.value.width + 'px',
    height: dimensions.value.height + 'px',
    overflow: 'hidden',
    transform: `scale(${props.zoom})`,
    transformOrigin: 'top left',
    backgroundPositionX: (renderFrame * dimensions.value.width * -1) + 'px',
    backgroundPositionY: (props.row * dimensions.value.height * -1) + 'px'
  } as Record<string,string>;
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
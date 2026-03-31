<template>
  <div ref="bubbleEl" class="resource-bubble">
    <span class="text-xs leading-none">{{ icon }}</span>
    <span class="text-[11px] font-mono leading-none text-slate-200">{{ value }}</span>
  </div>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {registerResourceTarget} from '../core/gameFeel';
import type {ResourceType} from "../core/types/Resource.ts";

const props = defineProps<{
  icon: string;
  label: string;
  value: number | string;
  resourceKey: ResourceType;
}>();

const bubbleEl = ref<HTMLElement | null>(null);

function syncTarget() {
  registerResourceTarget(props.resourceKey, bubbleEl.value);
}

onMounted(syncTarget);
watch(() => props.resourceKey, syncTarget);
watch(bubbleEl, syncTarget);
onBeforeUnmount(() => registerResourceTarget(props.resourceKey, null));
</script>

<style scoped>
.resource-bubble {
  @apply flex items-center gap-1.5 rounded-lg border border-slate-600/80 px-2 py-1.5 shadow-lg backdrop-blur-sm;
  background: rgba(2, 6, 23, 0.82);
}
</style>

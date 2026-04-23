<template>
  <NineSliceButton
    ref="bubbleEl"
    class="resource-bubble"
    :class="{ 'resource-bubble-clickable': clickable, 'resource-bubble-compact': compact }"
    type="button"
    :title="label"
    @click="emit('select')"
  >
    <span class="leading-none mr-4 text-xs">{{ icon }}</span>
    <span class="text-sm text-opacity-60 font-mono leading-none text-emerald-50 pr-2 pb-1">{{ value }}</span>
  </NineSliceButton>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {registerResourceTarget} from '../core/gameFeel';
import type {ResourceType} from "../core/types/Resource.ts";
import NineSliceButton from "./ui/NineSliceButton.vue";

const props = defineProps<{
  icon: string;
  label: string;
  value: number | string;
  resourceKey: ResourceType;
  clickable?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
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
  @apply flex items-center;
  background: rgba(35, 83, 46, 0.78);
  border-color: rgba(196, 228, 151, 0.34);
  appearance: none;
  border-radius: 0.5rem;
}

.resource-bubble-clickable {
  cursor: pointer;
  transition: transform 0.14s ease, border-color 0.14s ease, background-color 0.14s ease;
}

.resource-bubble-clickable:hover {
  transform: translateY(-2px);
  transition: transform 0.14s ease, border-color 0.14s ease, background-color 0.14s ease;
}

.resource-bubble-clickable:focus-visible {
  outline: 2px solid rgba(251, 191, 36, 0.7);
  outline-offset: 2px;
}

.resource-bubble-compact {
  padding: 0.3rem 0.45rem;
  gap: 0.25rem;
  background: rgba(31, 63, 62, 0.76);
  border-color: rgba(183, 242, 255, 0.26);
}
</style>

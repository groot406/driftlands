<template>
  <button
    ref="bubbleEl"
    class="resource-bubble"
    :class="{ 'resource-bubble-clickable': clickable }"
    type="button"
    :title="label"
    @click="emit('select')"
  >
    <span class="text-xs leading-none">{{ icon }}</span>
    <span class="text-[11px] font-mono leading-none text-emerald-50">{{ value }}</span>
  </button>
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
  clickable?: boolean;
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
  @apply flex items-center gap-1.5 rounded-lg border px-2 py-1.5 shadow-md;
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
  transform: translateY(-1px);
  border-color: rgba(252, 211, 77, 0.56);
  background: rgba(65, 103, 49, 0.9);
}

.resource-bubble-clickable:focus-visible {
  outline: 2px solid rgba(251, 191, 36, 0.7);
  outline-offset: 2px;
}
</style>

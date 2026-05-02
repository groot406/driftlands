<template>
  <NineSliceButton
    ref="bubbleEl"
    class="resource-bubble"
    :class="{ 'resource-bubble-clickable': clickable, 'resource-bubble-compact': compact }"
    type="button"
    :title="label"
    @click="emit('select')"
  >
    <span class="leading-none mr-3 text-xs">{{ icon }}</span>
    <span v-if="showLabel" class="resource-bubble-label">{{ label }}</span>
    <span class="resource-bubble-value">{{ value }}</span>
    <div v-if="breakdown?.length" class="resource-bubble-breakdown" role="tooltip">
      <p class="resource-bubble-breakdown-title">{{ label }}</p>
      <div
        v-for="entry in breakdown"
        :key="entry.key"
        class="resource-bubble-breakdown-row"
      >
        <span>{{ entry.icon }} {{ entry.label }}</span>
        <span>{{ entry.value }}</span>
      </div>
    </div>
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
  resourceKeys?: ResourceType[];
  clickable?: boolean;
  compact?: boolean;
  showLabel?: boolean;
  breakdown?: Array<{
    key: ResourceType;
    icon: string;
    label: string;
    value: number;
  }>;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
}>();

const bubbleEl = ref<HTMLElement | null>(null);

function syncTarget() {
  const keys = props.resourceKeys?.length ? props.resourceKeys : [props.resourceKey];
  for (const key of keys) {
    registerResourceTarget(key, bubbleEl.value);
  }
}

onMounted(syncTarget);
watch(() => props.resourceKey, syncTarget);
watch(() => props.resourceKeys?.join(','), syncTarget);
watch(bubbleEl, syncTarget);
onBeforeUnmount(() => {
  const keys = props.resourceKeys?.length ? props.resourceKeys : [props.resourceKey];
  for (const key of keys) {
    registerResourceTarget(key, null);
  }
});
</script>

<style scoped>
.resource-bubble {
  @apply relative flex items-center;
  background: rgba(35, 83, 46, 0.78);
  border-color: rgba(196, 228, 151, 0.34);
  appearance: none;
  border-radius: 0.5rem;
  gap: 0.25rem;
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

.resource-bubble-label {
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
  color: rgba(236, 253, 245, 0.95);
  white-space: nowrap;
}

.resource-bubble-value {
  padding-right: 0.35rem;
  padding-bottom: 0.05rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.85rem;
  line-height: 1;
  color: rgb(236 253 245);
}

.resource-bubble-breakdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 180px;
  padding: 0.65rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(196, 228, 151, 0.24);
  background: rgba(5, 23, 19, 0.94);
  box-shadow: 0 12px 24px rgba(2, 6, 23, 0.32);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity 0.14s ease, transform 0.14s ease;
  z-index: 20;
}

.resource-bubble:hover .resource-bubble-breakdown,
.resource-bubble:focus-visible .resource-bubble-breakdown {
  opacity: 1;
  transform: translateY(0);
}

.resource-bubble-breakdown-title {
  margin: 0 0 0.45rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(167, 243, 208, 0.85);
}

.resource-bubble-breakdown-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: rgba(240, 253, 244, 0.92);
}

.resource-bubble-breakdown-row + .resource-bubble-breakdown-row {
  margin-top: 0.3rem;
}
</style>

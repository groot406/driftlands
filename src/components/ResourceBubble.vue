<template>
  <button
    ref="bubbleEl"
    class="resource-bubble"
    :class="{ 'resource-bubble-clickable': clickable, 'resource-bubble-compact': compact }"
    :data-resource-tone="tone"
    type="button"
    :title="`${label}: ${value}`"
    :aria-label="`${label}: ${value}`"
    @click="emit('select')"
  >
    <span class="resource-bubble-frame" aria-hidden="true"></span>
    <span class="resource-bubble-icon-cell" aria-hidden="true">
      <span class="resource-bubble-icon">{{ icon }}</span>
    </span>
    <span class="resource-bubble-copy">
      <span v-if="showLabel" class="resource-bubble-label">{{ label }}</span>
      <span class="resource-bubble-stat">
        <span class="resource-bubble-value">{{ value }}</span>
      </span>
    </span>
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
  </button>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {registerResourceTarget} from '../core/gameFeel';
import type {ResourceType} from "../core/types/Resource.ts";
import type {ResourceGroup} from '../shared/game/resourceDefinitions.ts';

const props = withDefaults(defineProps<{
  icon: string;
  label: string;
  value: number | string;
  resourceKey: ResourceType;
  resourceKeys?: ResourceType[];
  tone?: ResourceGroup;
  clickable?: boolean;
  compact?: boolean;
  showLabel?: boolean;
  breakdown?: Array<{
    key: ResourceType;
    icon: string;
    label: string;
    value: number;
  }>;
}>(), {
  tone: 'materials',
});

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
  --resource-accent: #c7a15b;
  --resource-panel: rgba(45, 32, 19, 0.95);
  position: relative;
  flex: 0 0 8.55rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 0;
  width: 8.55rem;
  min-width: 8.55rem;
  min-height: 3rem;
  padding: 0.38rem 0.78rem 0.4rem;
  appearance: none;
  border-radius: 0.4rem;
  background:
    linear-gradient(180deg, rgba(255, 232, 179, 0.12), rgba(0, 0, 0, 0.05) 48%, rgba(0, 0, 0, 0.24)),
    radial-gradient(ellipse at 38% 4%, color-mix(in srgb, var(--resource-accent) 14%, transparent), transparent 66%),
    linear-gradient(180deg, var(--resource-panel), rgba(13, 11, 9, 0.40));
  backdrop-filter: blur(0.5rem);
  color: rgba(250, 242, 216, 0.96);
  box-shadow:
    0 1px 0 rgba(255, 235, 183, 0.11) inset,
    0 -2px 0 rgba(0, 0, 0, 0.27) inset,
    0 1px 5px rgba(0, 0, 0, 0.3);
  image-rendering: pixelated;
  transition:
    transform 0.14s ease,
    border-color 0.14s ease,
    filter 0.14s ease,
    box-shadow 0.14s ease;
}

.resource-bubble[data-resource-tone="food"] {
  --resource-accent: #d4a64f;
  --resource-panel: rgba(58, 39, 18, 0.95);
}

.resource-bubble[data-resource-tone="crops"] {
  --resource-accent: #9eb566;
  --resource-panel: rgba(31, 47, 24, 0.95);
}

.resource-bubble[data-resource-tone="materials"] {
  --resource-accent: #bd7851;
  --resource-panel: rgba(54, 31, 22, 0.95);
}

.resource-bubble[data-resource-tone="crafted_goods"] {
  --resource-accent: #aaa085;
  --resource-panel: rgba(31, 32, 30, 0.95);
}

.resource-bubble::after {
  display: none;
}

.resource-bubble-frame {
  display: none;
}

.resource-bubble-clickable {
  cursor: pointer;
}

.resource-bubble-clickable:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.resource-bubble-clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--resource-accent) 72%, rgba(255, 244, 181, 0.78));
  outline-offset: 2px;
}

.resource-bubble-compact {
  width: auto;
  min-height: 2.4rem;
  padding: 0.28rem 0.46rem;
  gap: 0.3rem;
}

.resource-bubble-icon-cell {
  position: absolute;
  left: 0.62rem;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.42rem;
  height: 1.42rem;
  border: 0;
  border-radius: 0.48rem;
  background:
    radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--resource-accent) 26%, transparent), transparent 66%),
    rgba(21, 15, 10, 0.78);
  box-shadow:
    0 1px 0 rgba(255, 229, 173, 0.1) inset,
    0 2px 5px rgba(0, 0, 0, 0.24);
}

.resource-bubble-copy {
  min-width: 0;
  display: grid;
  gap: 0.12rem;
  justify-items: center;
  width: 100%;
  padding-inline: 2.08rem;
  text-align: center;
}

.resource-bubble-label {
  min-width: 0;
  font-family: var(--resource-ui-font, 'Trebuchet MS', 'Gill Sans', system-ui, sans-serif);
  font-size: 0.64rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--resource-accent) 62%, rgba(255, 244, 219, 0.78));
  white-space: nowrap;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.75);
  width: 100%;
  text-align: center;
}

.resource-bubble-stat {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  width: 100%;
}

.resource-bubble-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  font-size: 0.88rem;
  line-height: 1;
  opacity: 0.98;
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.55)) saturate(0.92);
}

.resource-bubble-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  font-family: var(--resource-number-font, 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif);
  font-size: 1.04rem;
  font-weight: 900;
  line-height: 1;
  color: rgba(255, 247, 223, 0.98);
  text-align: center;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.78),
    0 0 8px rgba(78, 48, 20, 0.28);
  font-variant-numeric: tabular-nums;
}

.resource-bubble-breakdown {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  min-width: 12rem;
  padding: 0.66rem 0.72rem;
  border: 1px solid color-mix(in srgb, var(--resource-accent) 32%, rgba(30, 20, 12, 0.58));
  border-radius: 0.18rem;
  clip-path: polygon(0.36rem 0, calc(100% - 0.36rem) 0, 100% 0.36rem, 100% calc(100% - 0.36rem), calc(100% - 0.36rem) 100%, 0.36rem 100%, 0 calc(100% - 0.36rem), 0 0.36rem);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--resource-accent) 12%, transparent), transparent 42%),
    rgba(20, 14, 10, 0.97);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.48) inset,
    0 14px 26px rgba(0, 0, 0, 0.42);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-0.12rem);
  transition: opacity 0.14s ease, transform 0.14s ease;
  z-index: 20;
}

.resource-bubble:hover .resource-bubble-breakdown,
.resource-bubble:focus-visible .resource-bubble-breakdown {

  transform: translateY(0);
}

.resource-bubble-breakdown-title {
  margin: 0 0 0.45rem;
  font-family: var(--resource-ui-font, 'Trebuchet MS', 'Gill Sans', system-ui, sans-serif);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--resource-accent) 68%, rgba(255, 244, 219, 0.86));
}

.resource-bubble-breakdown-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.74rem;
  font-weight: 700;
  color: rgba(240, 253, 244, 0.92);
}

.resource-bubble-breakdown-row + .resource-bubble-breakdown-row {
  margin-top: 0.3rem;
}

@media (max-width: 640px) {
  .resource-bubble {
    flex-basis: 6.05rem;
    width: 6.05rem;
    min-width: 6.05rem;
    min-height: 2.5rem;
    padding: 0.28rem 0.5rem 0.3rem;
    border-radius: 0.74rem;
    scroll-snap-align: start;
  }

  .resource-bubble-icon-cell {
    left: 0.44rem;
    width: 1.18rem;
    height: 1.18rem;
    border-radius: 0.4rem;
  }

  .resource-bubble-copy {
    padding-inline: 1.5rem;
  }

  .resource-bubble-icon {
    font-size: 0.84rem;
  }

  .resource-bubble-label {
    font-size: 0.53rem;
  }

  .resource-bubble-value {
    font-size: 0.88rem;
  }

  .resource-bubble-breakdown {
    min-width: min(13rem, calc(100vw - 1rem));
  }
}

@media (max-width: 480px) {
  .resource-bubble {
    flex-basis: 4.15rem;
    width: 4.15rem;
    min-width: 4.15rem;
    min-height: 2.34rem;
    padding: 0.26rem 0.32rem 0.28rem;
  }

  .resource-bubble-icon-cell {
    left: 0.34rem;
    width: 1.05rem;
    height: 1.05rem;
  }

  .resource-bubble-copy {
    padding-inline: 1.16rem;
  }

  .resource-bubble-icon {
    font-size: 0.72rem;
  }

  .resource-bubble-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .resource-bubble-value {
    font-size: 0.8rem;
  }
}
</style>

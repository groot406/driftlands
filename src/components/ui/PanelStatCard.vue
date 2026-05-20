<template>
  <article class="panel-stat-card" :class="{ 'panel-stat-card--with-icon': hasIcon }">
    <span v-if="hasIcon" class="panel-stat-card__icon" :style="iconStyle" aria-hidden="true">
      <slot name="icon" />
    </span>
    <span class="panel-stat-card__label">{{ label }}</span>
    <strong class="panel-stat-card__value">{{ value }}</strong>
  </article>
</template>

<script setup lang="ts">
import { computed, useSlots, type CSSProperties } from 'vue';

const props = defineProps<{
  label: string;
  value: string | number;
  iconStyle?: CSSProperties;
}>();

const slots = useSlots();
const hasIcon = computed(() => !!props.iconStyle || !!slots.icon);
</script>

<script lang="ts">
export default { name: 'PanelStatCard' };
</script>

<style scoped>
.panel-stat-card {
  min-height: 3.3rem;
  display: grid;
  align-content: center;
  gap: 0.15rem;
  padding: 0.38rem 0.6rem;
  border: 7px solid transparent;
  border-image: url('../../assets/ui/settler-modal/stat-badge.png') 46 fill / 7px stretch;
}

.panel-stat-card--with-icon {
  grid-template-columns: 2.1rem minmax(0, 1fr);
  column-gap: 0.52rem;
  align-items: center;
}

.panel-stat-card__icon {
  grid-row: span 2;
  width: 1.85rem;
  height: 1.85rem;
  display: grid;
  place-items: center;
  background-repeat: no-repeat;
  background-size: 400% 300%;
  color: #f6d19c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.1rem;
  line-height: 1;
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.7));
}

.panel-stat-card__label,
.panel-stat-card__value {
  min-width: 0;
  font-family: Georgia, 'Times New Roman', serif;
}

.panel-stat-card__label {
  color: #c69549;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1.15;
  text-transform: uppercase;
}

.panel-stat-card__value {
  color: #fff0d2;
  font-size: 1rem;
  line-height: 1.05;
  overflow-wrap: anywhere;
  text-shadow: 0 1px 0 #070707;
}
</style>

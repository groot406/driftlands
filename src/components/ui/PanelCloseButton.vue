<template>
  <button
    class="panel-close-button"
    type="button"
    :title="title"
    :aria-label="ariaLabel"
    @click="handleClick"
  >
    <slot>Close</slot>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  ariaLabel?: string;
}>(), {
  title: 'Close',
  ariaLabel: 'Close panel',
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

function handleClick(event: MouseEvent) {
  event.stopPropagation();
  emit('click', event);
}
</script>

<script lang="ts">
export default { name: 'PanelCloseButton' };
</script>

<style scoped>
.panel-close-button {
  position: absolute;
  top: 0;
  right:0;
  z-index: 5;
  width: 2.6rem;
  height: 2.6rem;
  display: grid;
  place-items: center;
  border: 0;
  background: url('../../assets/ui/settler-modal/close-button.png') center / 100% 100% no-repeat;
  color: transparent;
  cursor: pointer;
  font-size: 0;
  line-height: 1;
  transition: filter 120ms ease, transform 80ms ease;
}

.panel-close-button:hover {
  filter: brightness(1.16);
}

.panel-close-button:active {
  transform: translateY(1px);
}
</style>

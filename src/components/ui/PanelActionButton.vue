<template>
  <button
    class="panel-action-button"
    :class="[
      `panel-action-button--${variant}`,
      `panel-action-button--${size}`,
      { 'panel-action-button--full': fullWidth },
    ]"
    :type="type"
    :disabled="disabled"
  >
    <span class="panel-action-button__content">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
type PanelActionButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
type PanelActionButtonSize = 'small' | 'medium' | 'large';

withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  variant?: PanelActionButtonVariant;
  size?: PanelActionButtonSize;
  fullWidth?: boolean;
}>(), {
  type: 'button',
  disabled: false,
  variant: 'primary',
  size: 'medium',
  fullWidth: false,
});
</script>

<script lang="ts">
export default { name: 'PanelActionButton' };
</script>

<style scoped>
.panel-action-button {
  appearance: none;
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  border: 1px solid var(--panel-action-button-border, rgba(182, 125, 55, 0.52));
  border-radius: 3px;
  background:
    linear-gradient(180deg, rgba(65, 45, 26, 0.72), rgba(21, 18, 14, 0.86)),
    rgba(12, 12, 11, 0.88);
  color: var(--panel-action-button-color, #fff0d2);
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 800;
  line-height: 1;
  text-align: center;
  text-transform: none;
  text-shadow: 0 2px 0 rgba(5, 4, 3, 0.92), 0 0 9px rgba(255, 214, 119, 0.2);
  cursor: pointer;
  user-select: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 226, 161, 0.16),
    inset 0 -1px 0 rgba(0, 0, 0, 0.72),
    0 1px 0 rgba(0, 0, 0, 0.38);
  transition:
    transform 100ms ease,
    border-color 130ms ease,
    background 130ms ease,
    box-shadow 130ms ease,
    color 130ms ease;
}

.panel-action-button::before {
  content: '';
  position: absolute;
  inset: 2px;
  border: 1px solid rgba(255, 226, 161, 0.055);
  border-radius: 1px;
  pointer-events: none;
}

.panel-action-button::after {
  content: '';
  position: absolute;
  inset: 0.28rem 0.55rem auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 238, 177, 0.28), transparent);
  opacity: 0.7;
  pointer-events: none;
}

.panel-action-button:hover:not(:disabled) {
  border-color: var(--panel-action-button-hover-border, rgba(226, 167, 76, 0.78));
  background:
    linear-gradient(180deg, rgba(82, 57, 30, 0.82), rgba(27, 22, 16, 0.9)),
    rgba(14, 13, 11, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 226, 161, 0.22),
    inset 0 -1px 0 rgba(0, 0, 0, 0.72),
    0 0 0 1px rgba(226, 167, 76, 0.08),
    0 6px 14px rgba(0, 0, 0, 0.22);
  color: var(--panel-action-button-hover-color, #fff8dc);
  transform: translateY(-1px);
}

.panel-action-button:active:not(:disabled) {
  background:
    linear-gradient(180deg, rgba(30, 24, 17, 0.94), rgba(54, 36, 20, 0.78)),
    rgba(10, 9, 8, 0.96);
  box-shadow:
    inset 0 2px 5px rgba(0, 0, 0, 0.72),
    inset 0 1px 0 rgba(255, 226, 161, 0.08);
  transform: translateY(1px);
}

.panel-action-button:focus-visible {
  outline: 2px solid rgba(255, 234, 165, 0.92);
  outline-offset: 2px;
}

.panel-action-button:disabled {
  color: rgba(205, 190, 160, 0.58);
  border-color: rgba(120, 104, 83, 0.28);
  background:
    linear-gradient(180deg, rgba(41, 38, 33, 0.54), rgba(18, 18, 17, 0.72)),
    rgba(12, 12, 11, 0.76);
  cursor: default;
  box-shadow:
    inset 0 1px 0 rgba(255, 226, 161, 0.05),
    inset 0 -1px 0 rgba(0, 0, 0, 0.48);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.9);
}

.panel-action-button:disabled::before,
.panel-action-button:disabled::after {
  opacity: 0.25;
}

.panel-action-button--small {
  min-height: 2.25rem;
  padding: 0 0.9rem;
  font-size: 0.72rem;
  letter-spacing: 0.045em;
}

.panel-action-button--medium {
  min-height: 2.65rem;
  padding: 0 1.08rem;
  font-size: 0.82rem;
  letter-spacing: 0.04em;
}

.panel-action-button--large {
  min-height: 3rem;
  padding: 0 1.32rem;
  font-size: 0.9rem;
  letter-spacing: 0.045em;
}

.panel-action-button--full {
  width: 100%;
}

.panel-action-button--primary {
  --panel-action-button-color: #fff1c5;
  --panel-action-button-hover-color: #fff9da;
  --panel-action-button-border: rgba(194, 139, 62, 0.62);
  --panel-action-button-hover-border: rgba(240, 184, 88, 0.82);
}

.panel-action-button--secondary {
  --panel-action-button-color: #f5dfb6;
  --panel-action-button-hover-color: #fff0c7;
  --panel-action-button-border: rgba(158, 115, 59, 0.5);
  --panel-action-button-hover-border: rgba(213, 155, 74, 0.72);
}

.panel-action-button--quiet {
  --panel-action-button-color: #d8c8a6;
  --panel-action-button-hover-color: #f2dfb7;
  --panel-action-button-border: rgba(128, 103, 72, 0.42);
  --panel-action-button-hover-border: rgba(181, 132, 64, 0.62);
}

.panel-action-button--danger {
  --panel-action-button-color: #ffd0bb;
  --panel-action-button-hover-color: #ffe0d1;
  --panel-action-button-border: rgba(150, 77, 55, 0.58);
  --panel-action-button-hover-border: rgba(202, 98, 67, 0.76);
}

.panel-action-button__content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
</style>

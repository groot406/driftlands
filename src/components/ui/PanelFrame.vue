<template>
  <component
      :is="as"
      class="ui-panel-frame"
      :class="[
      `ui-panel-frame--padding-${padding}`,
      { 'ui-panel-frame--elevated': elevated },
    ]"
  >
    <div class="flex flex-col h-min shadow-xl" aria-hidden="true">
      <div class="flex flex-row">
        <div class="ui-panel-frame__part ui-panel-frame__corner ui-panel-frame__corner--top-left"></div>
        <div class="ui-panel-frame__part ui-panel-frame__edge ui-panel-frame__edge--top flex-grow"></div>
        <div class="ui-panel-frame__part ui-panel-frame__corner ui-panel-frame__corner--top-right"></div>
      </div>
      <div class="flex flex-row flex-grow">
        <div class="ui-panel-frame__part ui-panel-frame__edge ui-panel-frame__edge--left"></div>
        <div class="ui-panel-frame__part ui-panel-frame__fill flex-grow h-max">
          <slot/>
        </div>
        <div class="ui-panel-frame__part ui-panel-frame__edge ui-panel-frame__edge--right"></div>
      </div>
      <div class="flex flex-row">
        <div class="ui-panel-frame__part ui-panel-frame__corner ui-panel-frame__corner--bottom-left"></div>
        <div class="ui-panel-frame__part ui-panel-frame__edge ui-panel-frame__edge--bottom flex-grow"></div>
        <div class="ui-panel-frame__part ui-panel-frame__corner ui-panel-frame__corner--bottom-right"></div>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  as?: string;
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  elevated?: boolean;
}>(), {
  as: 'div',
  padding: 'md',
  elevated: true,
});
</script>

<script lang="ts">
export default {name: 'PanelFrame'};
</script>

<style scoped>
.ui-panel-frame {
  position: relative;
  isolation: isolate;
  display: block;
  min-width: 3rem;
  min-height: 2.75rem;
  color: rgb(43, 33, 22);
}

.ui-panel-frame--elevated {
  filter: drop-shadow(0 10px 18px rgba(4, 8, 7, 0.34));
}

.ui-panel-frame__chrome {
  position: absolute;
  inset: 0;
  z-index: 0;

  pointer-events: none;
}

.ui-panel-frame__part {
  display: block;
  min-width: 0;
  min-height: 0;
  image-rendering: auto;
}

.ui-panel-frame__corner {
  background-repeat: no-repeat;
  background-size: 100% 100%;
  width: 19px;
  height: 18px;
}

.ui-panel-frame__corner--top-left {
  background-image: url('../../assets/ui/panel-corner-top-left.png');
}

.ui-panel-frame__corner--top-right {
  background-image: url('../../assets/ui/panel-corner-top-right.png');
}

.ui-panel-frame__corner--bottom-left {
  background-image: url('../../assets/ui/panel-corner-bottom-left.png');
}

.ui-panel-frame__corner--bottom-right {
  background-image: url('../../assets/ui/panel-corner-bottom-right.png');
}

.ui-panel-frame__edge--top {
  background-image: url('../../assets/ui/panel-top.png');
  background-position: center top;
  background-repeat: repeat-x;
}

.ui-panel-frame__edge--bottom {
  background-image: url('../../assets/ui/panel-bottom.png');
  background-position: center bottom;
  background-repeat: repeat-x;
  height:18px;
}

.ui-panel-frame__edge--left {
  background-image: url('../../assets/ui/panel-left.png');
  background-position: left center;
  background-repeat: repeat-y;
  width:18px;
}

.ui-panel-frame__edge--right {
  background-image: url('../../assets/ui/panel-right.png');
  background-position: right center;
  background-repeat: repeat-y;
  width:18px;
}

.ui-panel-frame__fill {
  background-image: url('../../assets/ui/panel-tilable-fill.png');
  background-position: center;
  background-repeat: repeat;
  box-shadow: inset 0 0 50px #8d7d4d14;
}

.ui-panel-frame__content {
  position: relative;
  z-index: 1;
  display: block;
  min-width: 0;
  min-height: 0;
}

.ui-panel-frame--padding-none .ui-panel-frame__content {
  padding: 0;
}

.ui-panel-frame--padding-xs .ui-panel-frame__content {
  padding: 0.55rem 0.7rem;
}

.ui-panel-frame--padding-sm .ui-panel-frame__content {
  padding: 0.8rem 0.95rem;
}

.ui-panel-frame--padding-md .ui-panel-frame__content {
  padding: 1rem 1.15rem;
}

.ui-panel-frame--padding-lg .ui-panel-frame__content {
  padding: 1.25rem 1.45rem;
}
</style>

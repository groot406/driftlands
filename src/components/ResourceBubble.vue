<template>
  <div
      class='flex flex-row items-center w-max min-w-[120px] backdrop-blur-lg justify-center p-1 rounded-lg bg-slate-700/20 border-t-2 border-b-1 border-t-white/10 border-b-black/20 shadow gap-x-2 px-2 pr-4 pointer-events-auto'>
    <div class='text-sm leading-none'>{{ icon }}</div>
    <div class='font-mono text-sm text-white/40'>{{ value }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string;
  label: string;
  value: number | string;
}>();
</script>

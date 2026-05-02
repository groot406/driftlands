import { ref } from 'vue';

export const serverDebugModeEnabled = ref(false);

export function setServerDebugModeEnabled(enabled: boolean | null | undefined) {
  serverDebugModeEnabled.value = enabled === true;
}

export function resetServerConfigStore() {
  serverDebugModeEnabled.value = false;
}

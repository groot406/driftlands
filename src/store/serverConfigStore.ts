import { ref } from 'vue';

export const serverDebugModeEnabled = ref(false);
export const currentPlayerIsAdmin = ref(false);

export function setServerDebugModeEnabled(enabled: boolean | null | undefined) {
  serverDebugModeEnabled.value = enabled === true;
}

export function setCurrentPlayerIsAdmin(enabled: boolean | null | undefined) {
  currentPlayerIsAdmin.value = enabled === true;
}

export function resetServerConfigStore() {
  serverDebugModeEnabled.value = false;
  currentPlayerIsAdmin.value = false;
}

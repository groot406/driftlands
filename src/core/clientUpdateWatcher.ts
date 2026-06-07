import { checkForClientUpdate } from '../store/clientUpdateStore.ts';

let started = false;
let timer: number | null = null;

export function startClientUpdateWatcher(intervalMs = 60_000) {
  if (started || typeof window === 'undefined') {
    return;
  }

  started = true;
  void checkForClientUpdate();

  timer = window.setInterval(() => {
    void checkForClientUpdate();
  }, intervalMs);

  window.addEventListener('focus', handlePotentialUpdate);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export function stopClientUpdateWatcher() {
  if (!started || typeof window === 'undefined') {
    return;
  }

  started = false;
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  window.removeEventListener('focus', handlePotentialUpdate);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

function handlePotentialUpdate() {
  void checkForClientUpdate();
}

function handleVisibilityChange() {
  if (!document.hidden) {
    handlePotentialUpdate();
  }
}

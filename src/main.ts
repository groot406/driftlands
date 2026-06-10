import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import './core/socket';
import { startClientUpdateWatcher } from './core/clientUpdateWatcher';
import { pauseGame, resumeGame } from './store/uiStore';
import {getActiveWindow, isWindowActive, WINDOW_IDS} from './core/windowManager';
import { getBuildTarget, isNativeAppBuild } from './core/buildTarget';
import { attachInteractiveTapHaptics } from './core/hapticsService';

const app = createApp(App);
app.mount('#app');
startClientUpdateWatcher();

requestAnimationFrame(() => {
  const buildTarget = getBuildTarget();
  document.body.dataset.buildTarget = buildTarget;
  if (isNativeAppBuild()) {
    document.body.classList.add('driftlands-native-app', `driftlands-native-app--${buildTarget}`);
    attachInteractiveTapHaptics();
  }
  document.body.classList.add('app-ready');
  window.setTimeout(() => {
    document.getElementById('boot-splash')?.remove();
  }, 320);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isWindowActive(WINDOW_IDS.IN_GAME_MENU)) {
      resumeGame();
    } else if (getActiveWindow.value === null ) {
      pauseGame();
    }
    e.preventDefault();
  }
});

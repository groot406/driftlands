import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import './core/socket';
import { pauseGame, resumeGame } from './store/uiStore';
import {getActiveWindow, isWindowActive, WINDOW_IDS} from './core/windowManager';

const app = createApp(App);
app.mount('#app');

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

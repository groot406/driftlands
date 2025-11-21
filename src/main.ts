import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { pauseGame, resumeGame, isPlaying, isPaused } from './store/uiStore';

const app = createApp(App);
app.mount('#app');

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isPlaying()) {
      pauseGame();
      e.preventDefault();
    } else if (isPaused()) {
      resumeGame();
      e.preventDefault();
    }
  }
});

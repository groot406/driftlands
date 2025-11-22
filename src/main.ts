import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { pauseGame, resumeGame, isPaused } from './store/uiStore';

const app = createApp(App);
app.mount('#app');

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isPaused()) {
      resumeGame();
    } else {
      pauseGame();
    }
    e.preventDefault();
  }
});

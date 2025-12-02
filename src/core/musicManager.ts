import { watch } from 'vue';
import { setBackgroundMusic } from '../store/soundStore';
import { uiStore } from '../store/uiStore';
import { camera } from './camera';
import { tileIndex, axialKey } from './world';

// Music tracks (you'll need to add these files to your assets)
const MUSIC_TRACKS = {
    title: '/src/assets/sounds/music/Peaceful Frontier.mp3',
    ambient: '/src/assets/sounds/music/Peaceful Frontier.mp3',
    forest: '/src/assets/sounds/music/Peaceful Frontier.mp3',
    desert: '/src/assets/sounds/music/Peaceful Frontier.mp3',
    mountain: '/src/assets/sounds/music/Peaceful Frontier.mp3',
    action: '/src/assets/sounds/music/Peaceful Frontier.mp3',
} as const;

export class MusicManager {
    private currentTrack: string | null = null;
    private lastBiomeCheck = { q: 0, r: 0 };
    private biomeCheckInterval: number | null = null;
    private initialized = false;

    initialize() {
        if (this.initialized) return;

        // Watch for phase changes
        watch(() => uiStore.phase, (phase) => {
            if (phase === 'title') {
                this.playTitleMusic();
            } else if (phase === 'playing') {
                this.playGameMusic();
                this.startBiomeTracking();
            }
        }, { immediate: true });

        this.initialized = true;
    }

    private async playTitleMusic() {
        if (this.currentTrack === MUSIC_TRACKS.title) return;

        this.stopBiomeTracking();
        await setBackgroundMusic(MUSIC_TRACKS.title, true);
        this.currentTrack = MUSIC_TRACKS.title;
    }

    private async playGameMusic() {
        // Start with ambient music, then let biome tracking take over
        if (this.currentTrack !== MUSIC_TRACKS.ambient) {
            await setBackgroundMusic(MUSIC_TRACKS.ambient, true);
            this.currentTrack = MUSIC_TRACKS.ambient;
        }
    }

    private startBiomeTracking() {
        if (this.biomeCheckInterval) return;

        // Check biome every 2 seconds
        this.biomeCheckInterval = window.setInterval(() => {
            this.checkBiomeMusic();
        }, 2000);
    }

    private stopBiomeTracking() {
        if (this.biomeCheckInterval) {
            clearInterval(this.biomeCheckInterval);
            this.biomeCheckInterval = null;
        }
    }

    private checkBiomeMusic() {
        // Only check if camera moved significantly
        const moved = Math.abs(camera.q - this.lastBiomeCheck.q) > 5 ||
                     Math.abs(camera.r - this.lastBiomeCheck.r) > 5;

        if (!moved) return;

        this.lastBiomeCheck = { q: camera.q, r: camera.r };

        const tileId = axialKey(Math.round(camera.q), Math.round(camera.r));
        const tile = tileIndex[tileId];
        if (!tile || !tile.terrain || !tile.biome) return;

        const biomeMusic = this.getBiomeMusic(tile.terrain, tile.biome);
        if (biomeMusic && biomeMusic !== this.currentTrack) {
            this.playBiomeMusic(biomeMusic);
        }
    }

    private getBiomeMusic(terrain: string, biome?: string): string | null {
        // Priority: specific terrain types, then biome
        switch (terrain) {
            case 'forest':
            case 'young_forest':
                return MUSIC_TRACKS.forest;
            case 'mountains':
            case 'mountains_with_mine':
                return MUSIC_TRACKS.mountain;
            case 'desert':
            case 'desert_rock':
                return MUSIC_TRACKS.desert;
            default:
                // Fall back to biome-based music
                switch (biome) {
                    case 'forest':
                        return MUSIC_TRACKS.forest;
                    case 'desert':
                        return MUSIC_TRACKS.desert;
                    case 'mountain':
                        return MUSIC_TRACKS.mountain;
                    default:
                        return MUSIC_TRACKS.ambient;
                }
        }
    }

    private async playBiomeMusic(track: string) {
        try {
            await setBackgroundMusic(track, true);
            this.currentTrack = track;
        } catch (error) {
            console.warn('Failed to play biome music:', error);
            // Fall back to ambient if specific track fails
            if (track !== MUSIC_TRACKS.ambient) {
                await setBackgroundMusic(MUSIC_TRACKS.ambient, true);
                this.currentTrack = MUSIC_TRACKS.ambient;
            }
        }
    }

    async playActionMusic() {
        // Temporarily play action music (e.g., during combat or intense activities)
        await setBackgroundMusic(MUSIC_TRACKS.action, true);
        this.currentTrack = MUSIC_TRACKS.action;
    }

    async returnToBiomeMusic() {
        // Return to biome-appropriate music after action music
        this.checkBiomeMusic();
    }

    destroy() {
        this.stopBiomeTracking();
        this.initialized = false;
    }
}

export const musicManager = new MusicManager();

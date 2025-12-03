import { watch } from 'vue';
import { setBackgroundMusic } from '../store/soundStore';
import { uiStore } from '../store/uiStore';

// Import title music immediately, lazy load game music
import peacefulFrontier from '../assets/sounds/music/Peaceful Frontier.mp3';

// Music playlist - add your music tracks here
// Tracks will play in order, then loop back to the first track
// Each track plays for approximately 3.5 minutes before switching
//
// To add new tracks:
// 1. Place your music files in /src/assets/sounds/music/
// 2. Import the file above
// 3. Add the imported variable to the array below
// 4. Supported formats: MP3, WAV, OGG

// Lazy loading music paths - loaded on demand to reduce memory usage
const MUSIC_PLAYLIST_PATHS = [
    () => import('../assets/sounds/music/Peaceful Frontier.mp3'),
    () => import('../assets/sounds/music/Peaceful Frontier-2.mp3'),
    () => import('../assets/sounds/music/Peaceful Frontier-3.mp3'),
    () => import('../assets/sounds/music/Fields of the Brave.mp3'),
    () => import('../assets/sounds/music/Fields of the Brave-2.mp3'),
    () => import('../assets/sounds/music/Pixel Harvest.mp3'),
    () => import('../assets/sounds/music/Pixel Harvest-2.mp3'),
    () => import('../assets/sounds/music/Pixel Harvest (Cover).mp3'),
    () => import('../assets/sounds/music/Fields of Quiet.mp3'),
    () => import('../assets/sounds/music/Fields of Quiet-2.mp3'),
    () => import('../assets/sounds/music/Wandering Hands.mp3'),
    () => import('../assets/sounds/music/Wandering Hands-2.mp3'),
    () => import('../assets/sounds/music/Pixel Odyssey.mp3'),
    () => import('../assets/sounds/music/Pixel Odyssey-2.mp3'),
    () => import('../assets/sounds/music/Exploring the Unknown-2.mp3'),
    () => import('../assets/sounds/music/Exploring the Unknown.mp3'),
] as const;

const TITLE_MUSIC = peacefulFrontier;

export class MusicManager {
    private currentTrack: string | null = null;
    private currentPlaylistIndex = 0;
    private playlistTimer: number | null = null;
    private initialized = false;
    private isInGame = false;
    private loadedTracks: Map<number, string> = new Map(); // Cache loaded track URLs

    initialize() {
        if (this.initialized) return;

        // Watch for phase changes
        watch(() => uiStore.phase, (phase) => {
            if (phase === 'title') {
                this.playTitleMusic();
            } else if (phase === 'playing') {
                this.startGamePlaylist();
            }
        }, { immediate: true });

        this.initialized = true;
    }

    private async playTitleMusic() {
        if (this.currentTrack === TITLE_MUSIC) return;

        this.stopPlaylist();
        this.isInGame = false;
        await setBackgroundMusic(TITLE_MUSIC, true);
        this.currentTrack = TITLE_MUSIC;
    }

    private async startGamePlaylist() {
        if (this.isInGame) return;

        this.isInGame = true;
        // Random start index
        this.currentPlaylistIndex = Math.floor(Math.random() * MUSIC_PLAYLIST_PATHS.length);
        await this.playCurrentPlaylistTrack();
        this.scheduleNextTrack();
    }

    private async playCurrentPlaylistTrack() {
        if (MUSIC_PLAYLIST_PATHS.length < 1) return;

        try {
            // Check bounds
            if (this.currentPlaylistIndex >= MUSIC_PLAYLIST_PATHS.length) {
                return;
            }

            // Check if track is already loaded
            let track = this.loadedTracks.get(this.currentPlaylistIndex);

            if (!track) {
                // Lazy load the track
                const trackLoader = MUSIC_PLAYLIST_PATHS[this.currentPlaylistIndex];
                if (trackLoader) {
                    const importedTrack = await trackLoader();
                    track = importedTrack.default;
                    this.loadedTracks.set(this.currentPlaylistIndex, track);
                }
            }

            if (track && track !== this.currentTrack) {
                await setBackgroundMusic(track, true);
                this.currentTrack = track;
                console.log(`Now playing track ${this.currentPlaylistIndex + 1}/${MUSIC_PLAYLIST_PATHS.length}`);
            }
        } catch (error) {
            console.warn('Failed to play playlist track:', error);
            this.skipToNextTrack();
        }
    }

    private scheduleNextTrack() {
        if (!this.isInGame) return;

        this.clearPlaylistTimer();

        // Schedule next track to play after current track duration
        // Since we don't have track duration info, use a reasonable default of 3-4 minutes
        const trackDuration = 3.5 * 60 * 1000; // 3.5 minutes in milliseconds

        this.playlistTimer = window.setTimeout(() => {
            if (this.isInGame) {
                this.playNextTrack();
            }
        }, trackDuration);
    }

    private async playNextTrack() {
        if (!this.isInGame || MUSIC_PLAYLIST_PATHS.length <= 1) return;

        this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % MUSIC_PLAYLIST_PATHS.length;
        await this.playCurrentPlaylistTrack();
        this.scheduleNextTrack();
    }

    private skipToNextTrack() {
        if (!this.isInGame) return;

        this.clearPlaylistTimer();
        this.playNextTrack();
    }

    private stopPlaylist() {
        this.clearPlaylistTimer();
        this.isInGame = false;
    }

    private clearPlaylistTimer() {
        if (this.playlistTimer) {
            clearTimeout(this.playlistTimer);
            this.playlistTimer = null;
        }
    }



    destroy() {
        this.stopPlaylist();
        this.loadedTracks.clear(); // Clear loaded track cache
        this.initialized = false;
    }
}

export const musicManager = new MusicManager();

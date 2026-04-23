import { reactive, watch, type WatchStopHandle } from 'vue';
import { setBackgroundMusic } from '../store/soundStore';
import { soundService } from './soundService';
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

// Track metadata for display
interface TrackEntry {
    loader: () => Promise<{ default: string }>;
    name: string;
}

const MUSIC_PLAYLIST: TrackEntry[] = [
    { loader: () => import('../assets/sounds/music/Peaceful Frontier.mp3'), name: 'Peaceful Frontier' },
    { loader: () => import('../assets/sounds/music/Peaceful Frontier-2.mp3'), name: 'Peaceful Frontier II' },
    { loader: () => import('../assets/sounds/music/Peaceful Frontier-3.mp3'), name: 'Peaceful Frontier III' },
    { loader: () => import('../assets/sounds/music/Fields of the Brave.mp3'), name: 'Fields of the Brave' },
    { loader: () => import('../assets/sounds/music/Fields of the Brave-2.mp3'), name: 'Fields of the Brave II' },
    { loader: () => import('../assets/sounds/music/Pixel Harvest.mp3'), name: 'Pixel Harvest' },
    { loader: () => import('../assets/sounds/music/Pixel Harvest-2.mp3'), name: 'Pixel Harvest II' },
    { loader: () => import('../assets/sounds/music/Pixel Harvest (Cover).mp3'), name: 'Pixel Harvest (Cover)' },
    { loader: () => import('../assets/sounds/music/Fields of Quiet.mp3'), name: 'Fields of Quiet' },
    { loader: () => import('../assets/sounds/music/Fields of Quiet-2.mp3'), name: 'Fields of Quiet II' },
    { loader: () => import('../assets/sounds/music/Wandering Hands.mp3'), name: 'Wandering Hands' },
    { loader: () => import('../assets/sounds/music/Wandering Hands-2.mp3'), name: 'Wandering Hands II' },
    { loader: () => import('../assets/sounds/music/Pixel Odyssey.mp3'), name: 'Pixel Odyssey' },
    { loader: () => import('../assets/sounds/music/Pixel Odyssey-2.mp3'), name: 'Pixel Odyssey II' },
    { loader: () => import('../assets/sounds/music/Exploring the Unknown-2.mp3'), name: 'Exploring the Unknown II' },
    { loader: () => import('../assets/sounds/music/Exploring the Unknown.mp3'), name: 'Exploring the Unknown' },
];

const TITLE_MUSIC = peacefulFrontier;

// Reactive state exposed to the UI
export interface MusicPlayerState {
    trackName: string;
    trackIndex: number;
    totalTracks: number;
    isPlaying: boolean;
    isInGame: boolean;
}

export const musicPlayerState = reactive<MusicPlayerState>({
    trackName: '',
    trackIndex: 0,
    totalTracks: MUSIC_PLAYLIST.length,
    isPlaying: false,
    isInGame: false,
});

export class MusicManager {
    private currentTrack: string | null = null;
    private currentPlaylistIndex = 0;
    private playlistTimer: number | null = null;
    private initialized = false;
    private isInGame = false;
    private isPaused = false;
    private loadedTracks: Map<number, string> = new Map(); // Cache loaded track URLs
    private stopPhaseWatch: WatchStopHandle | null = null;

    initialize() {
        if (this.initialized) return;

        // Watch for phase changes
        this.stopPhaseWatch = watch(() => uiStore.phase, (phase) => {
            if (phase === 'title') {
                this.playTitleMusic();
            } else if (phase === 'playing') {
                this.startGamePlaylist();
            }
        }, { immediate: true });

        this.initialized = true;
    }

    async playTitleMusic() {
        if (this.currentTrack === TITLE_MUSIC && soundService.getCurrentMusic() === TITLE_MUSIC) return;

        this.stopPlaylist();
        this.isInGame = false;
        this.isPaused = false;
        this.syncState();
        await setBackgroundMusic(TITLE_MUSIC, true);
        this.currentTrack = TITLE_MUSIC;
        musicPlayerState.isPlaying = true;
        musicPlayerState.trackName = 'Peaceful Frontier';
    }

    private async startGamePlaylist() {
        if (this.isInGame) return;

        this.isInGame = true;
        this.isPaused = false;
        // Random start index
        this.currentPlaylistIndex = Math.floor(Math.random() * MUSIC_PLAYLIST.length);
        this.syncState();
        await this.playCurrentPlaylistTrack();
        this.scheduleNextTrack();
    }

    private async playCurrentPlaylistTrack() {
        if (MUSIC_PLAYLIST.length < 1) return;

        try {
            // Check bounds
            if (this.currentPlaylistIndex >= MUSIC_PLAYLIST.length) {
                return;
            }

            const entry = MUSIC_PLAYLIST[this.currentPlaylistIndex];
            if (!entry) return;

            // Check if track is already loaded
            let track = this.loadedTracks.get(this.currentPlaylistIndex);

            if (!track) {
                // Lazy load the track
                const importedTrack = await entry.loader();
                track = importedTrack.default;
                this.loadedTracks.set(this.currentPlaylistIndex, track);
            }

            if (track && track !== this.currentTrack) {
                await setBackgroundMusic(track, true);
                this.currentTrack = track;
                this.isPaused = false;
                this.syncState();
                console.log(`Now playing: ${entry.name} (${this.currentPlaylistIndex + 1}/${MUSIC_PLAYLIST.length})`);
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
            if (this.isInGame && !this.isPaused) {
                this.advanceNext();
            }
        }, trackDuration);
    }

    private async advanceNext() {
        if (!this.isInGame || MUSIC_PLAYLIST.length <= 1) return;

        this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % MUSIC_PLAYLIST.length;
        await this.playCurrentPlaylistTrack();
        this.scheduleNextTrack();
    }

    private skipToNextTrack() {
        if (!this.isInGame) return;

        this.clearPlaylistTimer();
        this.advanceNext();
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

    /** Sync internal state to the reactive musicPlayerState for the UI */
    private syncState() {
        const entry = MUSIC_PLAYLIST[this.currentPlaylistIndex];
        musicPlayerState.trackName = entry?.name ?? '';
        musicPlayerState.trackIndex = this.currentPlaylistIndex;
        musicPlayerState.totalTracks = MUSIC_PLAYLIST.length;
        musicPlayerState.isPlaying = !this.isPaused && this.isInGame;
        musicPlayerState.isInGame = this.isInGame;
    }

    // ── Public API for MusicPlayer UI ──────────────────────────

    /** Skip to next track */
    next() {
        if (!this.isInGame) return;
        this.clearPlaylistTimer();
        this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % MUSIC_PLAYLIST.length;
        this.playCurrentPlaylistTrack().then(() => this.scheduleNextTrack());
    }

    /** Skip to previous track */
    prev() {
        if (!this.isInGame) return;
        this.clearPlaylistTimer();
        this.currentPlaylistIndex = (this.currentPlaylistIndex - 1 + MUSIC_PLAYLIST.length) % MUSIC_PLAYLIST.length;
        this.playCurrentPlaylistTrack().then(() => this.scheduleNextTrack());
    }

    /** Pause music playback */
    pause() {
        if (this.isPaused) return;
        this.isPaused = true;
        this.clearPlaylistTimer();
        soundService.pauseMusic();
        this.syncState();
    }

    /** Resume music playback */
    resume() {
        if (!this.isPaused) return;
        this.isPaused = false;
        soundService.resumeMusic();
        this.scheduleNextTrack();
        this.syncState();
    }

    /** Toggle play/pause */
    togglePlayback() {
        if (this.isPaused) {
            this.resume();
        } else {
            this.pause();
        }
    }

    destroy() {
        this.stopPlaylist();
        if (this.stopPhaseWatch) {
            this.stopPhaseWatch();
            this.stopPhaseWatch = null;
        }
        this.loadedTracks.clear(); // Clear loaded track cache
        this.initialized = false;
        musicPlayerState.isPlaying = false;
        musicPlayerState.isInGame = false;
        musicPlayerState.trackName = '';
    }
}

export const musicManager = new MusicManager();

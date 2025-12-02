import { watch } from 'vue';
import { setBackgroundMusic } from '../store/soundStore';
import { uiStore } from '../store/uiStore';

// Music playlist - add your music tracks here
// Tracks will play in order, then loop back to the first track
// Each track plays for approximately 3.5 minutes before switching
//
// To add new tracks:
// 1. Place your music files in /src/assets/sounds/music/
// 2. Add the path to the array below
// 3. Supported formats: MP3, WAV, OGG
//
// Example with multiple tracks:
// const MUSIC_PLAYLIST = [
//     '/src/assets/sounds/music/Peaceful Frontier.mp3',
//     '/src/assets/sounds/music/Forest Adventure.mp3',
//     '/src/assets/sounds/music/Desert Journey.mp3',
//     '/src/assets/sounds/music/Mountain Peaks.mp3',
//     '/src/assets/sounds/music/Ocean Voyage.mp3',
// ] as const;

const MUSIC_PLAYLIST = [
    '/src/assets/sounds/music/Peaceful Frontier.mp3',
    '/src/assets/sounds/music/Peaceful Frontier-2.mp3',
    '/src/assets/sounds/music/Peaceful Frontier-3.mp3',
    '/src/assets/sounds/music/Fields of the Brave.mp3',
    '/src/assets/sounds/music/Fields of the Brave-2.mp3',
    '/src/assets/sounds/music/Pixel Harvest.mp3',
    '/src/assets/sounds/music/Pixel Harvest-2.mp3',
    '/src/assets/sounds/music/Fields of Quiet.mp3',
    '/src/assets/sounds/music/Fields of Quiet-2.mp3',
    '/src/assets/sounds/music/Wandering Hands.mp3',
    '/src/assets/sounds/music/Wandering Hands-2.mp3',
] as const;

const TITLE_MUSIC = '/src/assets/sounds/music/Peaceful Frontier.mp3';

export class MusicManager {
    private currentTrack: string | null = null;
    private currentPlaylistIndex = 0;
    private playlistTimer: number | null = null;
    private initialized = false;
    private isInGame = false;

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
        this.currentPlaylistIndex = Math.floor(Math.random() * MUSIC_PLAYLIST.length);
        await this.playCurrentPlaylistTrack();
        this.scheduleNextTrack();
    }

    private async playCurrentPlaylistTrack() {
        if (MUSIC_PLAYLIST.length < 1) return;

        const track = MUSIC_PLAYLIST[this.currentPlaylistIndex];
        if (track && track !== this.currentTrack) {
            try {
                await setBackgroundMusic(track, true);
                this.currentTrack = track;
                console.log(`Now playing: ${track} (${this.currentPlaylistIndex + 1}/${MUSIC_PLAYLIST.length})`);
            } catch (error) {
                console.warn('Failed to play playlist track:', error);
                this.skipToNextTrack();
            }
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
        if (!this.isInGame || MUSIC_PLAYLIST.length <= 1) return;

        this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % MUSIC_PLAYLIST.length;
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
        this.initialized = false;
    }
}

export const musicManager = new MusicManager();

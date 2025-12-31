import { reactive } from 'vue';
import { soundService, soundState } from '../core/soundService';

interface SoundSettings {
    masterVolume: number;
    musicVolume: number;
    effectsVolume: number;
    soundEnabled: boolean;
}

const SOUND_SETTINGS_KEY = 'driftlands-sound-settings';

function loadSoundSettings(): SoundSettings {
    try {
        const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                masterVolume: parsed.masterVolume ?? 0.7,
                musicVolume: parsed.musicVolume ?? 0.8,
                effectsVolume: parsed.effectsVolume ?? 1.0,
                soundEnabled: parsed.soundEnabled ?? true,
            };
        }
    } catch (error) {
        console.warn('Failed to load sound settings:', error);
    }

    return {
        masterVolume: 0.7,
        musicVolume: 0.8,
        effectsVolume: 1.0,
        soundEnabled: true,
    };
}

function saveSoundSettings(settings: SoundSettings) {
    try {
        localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('Failed to save sound settings:', error);
    }
}

export const soundStore = reactive<SoundSettings>(loadSoundSettings());

// Apply initial settings
soundService.setMasterVolume(soundStore.masterVolume);
soundService.setMusicVolume(soundStore.musicVolume);
soundService.setEffectsVolume(soundStore.effectsVolume);

export function setMasterVolume(volume: number) {
    soundStore.masterVolume = Math.max(0, Math.min(1, volume));
    if (soundStore.soundEnabled) {
        soundService.setMasterVolume(soundStore.masterVolume);
    }
    saveSoundSettings(soundStore);
}

export function setMusicVolume(volume: number) {
    soundStore.musicVolume = Math.max(0, Math.min(1, volume));
    if (soundStore.soundEnabled) {
        soundService.setMusicVolume(soundStore.musicVolume);
    }
    saveSoundSettings(soundStore);
}

export function setEffectsVolume(volume: number) {
    soundStore.effectsVolume = Math.max(0, Math.min(1, volume));
    if (soundStore.soundEnabled) {
        soundService.setEffectsVolume(soundStore.effectsVolume);
    }
    saveSoundSettings(soundStore);
}

export function toggleSound(enabled?: boolean) {
    soundStore.soundEnabled = enabled !== undefined ? enabled : !soundStore.soundEnabled;

    if (soundStore.soundEnabled) {
        // Re-apply all volume settings
        soundService.setMasterVolume(soundStore.masterVolume);
        soundService.setMusicVolume(soundStore.musicVolume);
        soundService.setEffectsVolume(soundStore.effectsVolume);
    } else {
        // Mute everything
        soundService.setMasterVolume(0);
    }

    saveSoundSettings(soundStore);
}

// Music control functions
export async function setBackgroundMusic(musicPath: string | null, crossfade: boolean = true) {
    if (!soundStore.soundEnabled) return;

    await soundService.setMusic(musicPath, crossfade);
}

export function stopBackgroundMusic() {
    soundService.stopMusic();
}

// Positional audio functions
export async function playPositionalSound(
    id: string,
    soundPath: string,
    q: number,
    r: number,
    options?: {
        baseVolume?: number;
        maxDistance?: number;
        loop?: boolean;
    }
) {
    if (!soundStore.soundEnabled) return;
    await soundService.playPositionalSound(id, soundPath, q, r, options);
}


// Get current sound state for UI
export function getSoundState() {
    return {
        ...soundStore,
        currentMusic: soundState.currentMusic,
        activeSounds: Array.from(soundState.positionalSounds.values()).map(s => ({
            id: s.id,
            q: s.q,
            r: s.r,
            isPlaying: s.isPlaying,
            loop: s.loop
        }))
    };
}

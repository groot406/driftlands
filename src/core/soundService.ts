import { reactive, watch } from 'vue';
import { camera, hexDistance } from './camera';
import { isPaused } from '../store/uiStore';

export interface PositionalSound {
    id: string;
    q: number;
    r: number;
    audioElement: HTMLAudioElement;
    baseVolume: number;
    maxDistance: number;
    loop: boolean;
    isPlaying: boolean;
}

export interface SoundState {
    masterVolume: number;
    musicVolume: number;
    effectsVolume: number;
    currentMusic: string | null;
    musicCrossfadeTime: number;
    maxAudioDistance: number;
    panningStrength: number; // 0-1, how much left/right panning to apply
    positionalSounds: Map<string, PositionalSound>;
}

export const soundState: SoundState = reactive({
    masterVolume: 0.7,
    musicVolume: 0.8,
    effectsVolume: 1.0,
    currentMusic: null,
    musicCrossfadeTime: 2000, // ms
    maxAudioDistance: 20, // hex distance
    panningStrength: 0.7,
    positionalSounds: new Map()
});

class SoundService {
    private audioContext: AudioContext | null = null;
    private musicAudio: HTMLAudioElement | null = null;
    private crossfadeAudio: HTMLAudioElement | null = null;
    private musicGainNode: GainNode | null = null;
    private crossfadeGainNode: GainNode | null = null;
    private pannerNodes: Map<string, StereoPannerNode> = new Map();
    private gainNodes: Map<string, GainNode> = new Map();
    private updateInterval: number | null = null;
    private initialized = false;

    async initialize() {
        if (this.initialized) return;

        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.setupMusicNodes();
            this.startUpdateLoop();
            this.initialized = true;
            console.log('Sound system initialized');
        } catch (error) {
            console.warn('Failed to initialize audio context:', error);
        }
    }

    private setupMusicNodes() {
        if (!this.audioContext) return;

        this.musicGainNode = this.audioContext.createGain();
        this.crossfadeGainNode = this.audioContext.createGain();

        this.musicGainNode.connect(this.audioContext.destination);
        this.crossfadeGainNode.connect(this.audioContext.destination);

        this.crossfadeGainNode.gain.value = 0;
    }

    private startUpdateLoop() {
        if (this.updateInterval) return;

        this.updateInterval = window.setInterval(() => {
            this.updatePositionalAudio();
        }, 1000 / 30); // 30 FPS update rate
    }

    private updatePositionalAudio() {
        if (!this.audioContext || isPaused()) return;

        // Use Array.from to avoid modifying map during iteration when removing sounds
        const soundsToRemove: string[] = [];

        soundState.positionalSounds.forEach((sound) => {
            // Check if non-looping sound has finished playing
            const hasFinished = !sound.loop &&
                                sound.audioElement.currentTime >= sound.audioElement.duration &&
                                sound.audioElement.currentTime > 0;

            if (hasFinished) {
                soundsToRemove.push(sound.id);
                return;
            }

            if (!sound.isPlaying) return;

            const distance = hexDistance(camera, { q: sound.q, r: sound.r });
            const maxDist = Math.min(sound.maxDistance, soundState.maxAudioDistance);

            // Calculate volume based on distance
            let volume = 0;
            if (distance <= maxDist) {
                volume = sound.baseVolume * (1 - (distance / maxDist));
                volume *= soundState.effectsVolume * soundState.masterVolume;
            }

            // Calculate panning based on relative position
            const deltaQ = sound.q - camera.q * 2;
            const deltaR = sound.r - camera.r * 2;

            // Convert hex coordinates to screen-relative positioning for panning
            const screenX = deltaQ + deltaR * 0.5;
            const normalizedPan = Math.max(-1, Math.min(1, screenX / maxDist));
            const pan = normalizedPan * soundState.panningStrength;

            // Apply volume and panning
            sound.audioElement.volume = Math.max(0, Math.min(1, volume));

            const gainNode = this.gainNodes.get(sound.id);
            const pannerNode = this.pannerNodes.get(sound.id);

            if (gainNode) {
                gainNode.gain.value = volume;
            }

            if (pannerNode) {
                pannerNode.pan.value = pan;
            }

            // Stop sound if too far away
            if (volume <= 0 && sound.audioElement.currentTime > 0) {
                sound.audioElement.pause();
                sound.isPlaying = false;
            } else if (volume > 0 && sound.audioElement.paused && sound.audioElement.readyState >= 2) {
                // Only restart the sound if it's meant to loop, or if it hasn't finished playing yet
                const soundHasFinished = sound.audioElement.currentTime >= sound.audioElement.duration;
                if (sound.loop || !soundHasFinished) {
                    sound.audioElement.play().catch(e => console.warn('Failed to play positional sound:', e));
                    sound.isPlaying = true;
                }
            }
        });

        // Remove finished non-looping sounds
        soundsToRemove.forEach(id => this.removePositionalSound(id));
    }

    async setMusic(musicPath: string | null, crossfade: boolean = true) {
        await this.initialize();

        if (!musicPath) {
            this.stopMusic();
            return;
        }

        if (soundState.currentMusic === musicPath) return;

        const newAudio = new Audio(musicPath);
        newAudio.loop = true;
        newAudio.preload = 'auto';

        if (!this.audioContext || !this.musicGainNode || !this.crossfadeGainNode) {
            console.warn('Audio context not ready');
            return;
        }

        // Resume audio context if it's suspended (required by browsers)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            if (crossfade && this.musicAudio && soundState.currentMusic) {
                // Crossfade from current to new music
                await this.crossfadeMusic(newAudio);
            } else {
                // Direct switch
                if (this.musicAudio) {
                    this.musicAudio.pause();
                }

                // Create source and connect to main music gain node
                const source = this.audioContext.createMediaElementSource(newAudio);
                source.connect(this.musicGainNode);

                this.musicAudio = newAudio;
                this.musicGainNode.gain.value = soundState.musicVolume * soundState.masterVolume;

                await newAudio.play();
            }

            soundState.currentMusic = musicPath;
        } catch (error) {
            console.warn('Failed to set music:', error);
        }
    }

    // Removed setupCurrentMusicNode - we now handle connection directly in setMusic

    private async crossfadeMusic(newAudio: HTMLAudioElement) {
        if (!this.musicGainNode || !this.crossfadeGainNode || !this.musicAudio || !this.audioContext) return;

        const fadeTime = soundState.musicCrossfadeTime / 1000; // Convert to seconds
        const currentTime = this.audioContext.currentTime;

        // Create source for new audio and connect to crossfade node
        const newSource = this.audioContext.createMediaElementSource(newAudio);
        newSource.connect(this.crossfadeGainNode);

        // Start new audio with crossfade node at 0 volume
        this.crossfadeGainNode.gain.value = 0;
        await newAudio.play();

        // Fade out current, fade in new
        this.musicGainNode.gain.linearRampToValueAtTime(0, currentTime + fadeTime);
        this.crossfadeGainNode.gain.linearRampToValueAtTime(
            soundState.musicVolume * soundState.masterVolume,
            currentTime + fadeTime
        );

        // After fade, swap the audio elements and nodes
        setTimeout(() => {
            if (this.musicAudio) {
                this.musicAudio.pause();
            }

            this.musicAudio = newAudio;

            // Swap the gain nodes
            const tempGain = this.musicGainNode;
            this.musicGainNode = this.crossfadeGainNode;
            this.crossfadeGainNode = tempGain;

            // Reset crossfade node for next time
            if (this.crossfadeGainNode) {
                this.crossfadeGainNode.gain.value = 0;
            }
        }, soundState.musicCrossfadeTime);
    }

    stopMusic() {
        if (this.musicAudio) {
            this.musicAudio.pause();
            this.musicAudio = null;
        }
        if (this.crossfadeAudio) {
            this.crossfadeAudio.pause();
            this.crossfadeAudio = null;
        }
        soundState.currentMusic = null;
    }

    async playPositionalSound(
        id: string,
        soundPath: string,
        q: number,
        r: number,
        options: {
            baseVolume?: number;
            maxDistance?: number;
            loop?: boolean;
        } = {}
    ) {
        await this.initialize();

        // Remove existing sound with same id
        this.removePositionalSound(id);

        const audio = new Audio(soundPath);
        audio.loop = options.loop || false;
        audio.preload = 'auto';

        const sound: PositionalSound = {
            id,
            q,
            r,
            audioElement: audio,
            baseVolume: options.baseVolume || 1.0,
            maxDistance: options.maxDistance || soundState.maxAudioDistance,
            loop: audio.loop,
            isPlaying: false
        };

        // Add ended event listener for non-looping sounds
        if (!sound.loop) {
            audio.addEventListener('ended', () => {
                sound.isPlaying = false;
                this.removePositionalSound(id);
            });
        }

        if (this.audioContext) {
            // Resume audio context if it's suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            try {
                // Create audio nodes for this sound
                const source = this.audioContext.createMediaElementSource(audio);
                const gainNode = this.audioContext.createGain();
                const pannerNode = this.audioContext.createStereoPanner();

                source.connect(gainNode);
                gainNode.connect(pannerNode);
                pannerNode.connect(this.audioContext.destination);

                this.gainNodes.set(id, gainNode);
                this.pannerNodes.set(id, pannerNode);
            } catch (error) {
                console.warn('Failed to setup audio nodes for positional sound:', error);
            }
        }

        soundState.positionalSounds.set(id, sound);

        // Initial positioning update
        this.updatePositionalAudio();

        // Try to play the sound
        try {
            await audio.play();
            sound.isPlaying = true;
        } catch (error) {
            console.warn('Failed to play positional sound:', error);
        }
    }

    removePositionalSound(id: string) {
        const sound = soundState.positionalSounds.get(id);
        if (sound) {
            sound.audioElement.pause();
            sound.isPlaying = false;
            soundState.positionalSounds.delete(id);
        }

        // Clean up audio nodes
        this.gainNodes.delete(id);
        this.pannerNodes.delete(id);
    }

    updateSoundPosition(id: string, q: number, r: number) {
        const sound = soundState.positionalSounds.get(id);
        if (sound) {
            sound.q = q;
            sound.r = r;
        }
    }

    setMasterVolume(volume: number) {
        soundState.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }

    setMusicVolume(volume: number) {
        soundState.musicVolume = Math.max(0, Math.min(1, volume));
        this.updateMusicVolume();
    }

    setEffectsVolume(volume: number) {
        soundState.effectsVolume = Math.max(0, Math.min(1, volume));
    }

    private updateMusicVolume() {
        if (this.musicGainNode) {
            this.musicGainNode.gain.value = soundState.musicVolume * soundState.masterVolume;
        }
    }

    private updateAllVolumes() {
        this.updateMusicVolume();
        // Positional sound volumes are updated in the update loop
    }

    pauseAll() {
        if (this.musicAudio && !this.musicAudio.paused) {
            this.musicAudio.pause();
        }

        this.pauseSounds()
    }

    pauseSounds() {
        soundState.positionalSounds.forEach(sound => {
            if (!sound.audioElement.paused) {
                sound.audioElement.pause();
                sound.isPlaying = false;
            }
        });
    }

    resumeAll() {
        if (this.musicAudio && this.musicAudio.paused && soundState.currentMusic) {
            this.musicAudio.play().catch(e => console.warn('Failed to resume music:', e));
        }

        // Positional sounds will resume automatically in the update loop based on distance
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        this.stopMusic();

        soundState.positionalSounds.forEach((sound) => {
            sound.audioElement.pause();
        });

        soundState.positionalSounds.clear();
        this.gainNodes.clear();
        this.pannerNodes.clear();

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.initialized = false;
    }
}

export const soundService = new SoundService();

// Watch for pause state changes
watch(() => isPaused(), (paused) => {
    if (paused) {
        soundService.pauseSounds();
    } else {
        soundService.resumeAll();
    }
});

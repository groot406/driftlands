import { reactive } from 'vue';
import { camera, hexDistance } from './camera';
import { isPaused } from '../store/uiStore';
import { taskStore } from '../store/taskStore';
import { getTaskDefinition } from './taskRegistry';
import { tileIndex } from './world';
import type { TaskSoundConfig } from './tasks';

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
    musicCrossfadeTime: 3500, // ms
    maxAudioDistance: 20, // hex distance
    panningStrength: 1,
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
    private lastTaskSoundCheck = 0;
    private audioDataCache: Map<string, string> = new Map(); // Cache blob URLs for audio data
    private loadingPromises: Map<string, Promise<string>> = new Map(); // Track loading promises

    private initializationPromise: Promise<void> | null = null;

    async initialize() {
        if (this.initialized) return;

        // Prevent multiple simultaneous initializations
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.doInitialize();
        return this.initializationPromise;
    }

    private async doInitialize() {
        if (this.initialized) return;

        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.setupMusicNodes();
            this.startUpdateLoop();
            this.initialized = true;
            console.log('Sound system initialized');
        } catch (error) {
            console.warn('Failed to initialize audio context:', error);
        } finally {
            this.initializationPromise = null;
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
        }, 1000 / 15); // 15 FPS update rate - reduced from 30 FPS to improve performance
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
            const deltaQ = sound.q - camera.q;
            const deltaR = sound.r - camera.r;

            // Convert hex coordinates to screen-relative positioning for panning
            const screenX = deltaQ + deltaR * 0.5;
            const normalizedPan = Math.max(-1, Math.min(1, screenX / maxDist));
            const pan = normalizedPan * soundState.panningStrength;

            // Apply volume and panning - only update if values have changed significantly
            const newVolume = Math.max(0, Math.min(1, volume));
            if (Math.abs(sound.audioElement.volume - newVolume) > 0.01) {
                sound.audioElement.volume = newVolume;
            }

            const gainNode = this.gainNodes.get(sound.id);
            const pannerNode = this.pannerNodes.get(sound.id);

            if (gainNode && Math.abs(gainNode.gain.value - volume) > 0.01) {
                gainNode.gain.value = volume;
            }

            if (pannerNode && Math.abs(pannerNode.pan.value - pan) > 0.01) {
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

        // Check for active tasks that should have sounds but don't yet - throttled to every 500ms
        const now = performance.now();
        if (now - this.lastTaskSoundCheck > 500) {
            this.checkForMissingTaskSounds();
            this.lastTaskSoundCheck = now;
        }

        // Remove finished non-looping sounds
        soundsToRemove.forEach(id => this.removePositionalSound(id));
    }

    private checkForMissingTaskSounds() {
        // Get all active tasks
        for (const task of taskStore.tasks) {
            if (!task.active) continue;

            // Get the tile for this task
            const tile = tileIndex[task.tileId];
            if (!tile) continue;

            // Check if task is within audio range
            const distance = hexDistance(camera, { q: tile.q, r: tile.r });
            if (distance > soundState.maxAudioDistance) continue;

            // Get task definition to check if it has sound
            const taskDef = getTaskDefinition(task.type);
            if (!taskDef?.getSoundOnStart) continue;

            // Get sound configuration
            const soundConfig = taskDef.getSoundOnStart(tile, []);
            if (!soundConfig || !soundConfig.loop) continue; // Only auto-start looping sounds


            // Check if sound is already playing for this task
            const soundId = `${task.type}-${tile.q}-${tile.r}`;
            const existingSound = soundState.positionalSounds.get(soundId);
            if (existingSound) {
                existingSound.isPlaying = true;
                continue;
            }

            // Start the task sound
            this.startTaskSoundForTile(tile, task.type, soundConfig);
        }
    }

    private startTaskSoundForTile(tile: { q: number; r: number }, taskType: string, soundConfig: TaskSoundConfig) {
        const soundId = `${taskType}-${tile.q}-${tile.r}`;

        // Use the existing playPositionalSound method but don't await it to avoid blocking
        this.playPositionalSound(
            soundId,
            soundConfig.soundPath,
            tile.q,
            tile.r,
            {
                baseVolume: soundConfig.baseVolume,
                maxDistance: soundConfig.maxDistance,
                loop: soundConfig.loop
            }
        ).catch(error => {
            console.warn(`Failed to auto-start task sound for ${taskType}:`, error);
        });
    }

    async setMusic(musicPath: string | null, crossfade: boolean = true) {
        if (!musicPath) {
            this.stopMusic();
            return;
        }

        await this.initialize();

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

        // Load cached audio data to avoid repeated network requests
        const cachedAudioUrl = await this.loadAudioData(soundPath);

        // Create fresh audio element using cached data
        // Audio elements can't be properly shared between multiple simultaneous sounds
        const audio = new Audio(cachedAudioUrl);
        audio.preload = 'metadata'; // Use metadata instead of auto to reduce memory usage
        audio.loop = options.loop || false;

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

    private async loadAudioData(soundPath: string): Promise<string> {
        soundPath = 'src/assets/sounds/' + soundPath;
        // Check if already cached
        const cached = this.audioDataCache.get(soundPath);
        if (cached) {
            return cached;
        }

        // Check if already loading
        const loading = this.loadingPromises.get(soundPath);
        if (loading) {
            return loading;
        }

        // Start loading
        const loadPromise = this.fetchAudioData(soundPath);
        this.loadingPromises.set(soundPath, loadPromise);

        try {
            const blobUrl = await loadPromise;
            this.audioDataCache.set(soundPath, blobUrl);
            return blobUrl;
        } finally {
            this.loadingPromises.delete(soundPath);
        }
    }

    private async fetchAudioData(soundPath: string): Promise<string> {
        try {
            const response = await fetch(soundPath);
            if (!response.ok) {
                throw new Error(`Failed to load audio: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: response.headers.get('content-type') || 'audio/mpeg' });
            return URL.createObjectURL(blob);
        } catch (error) {
            console.warn(`Failed to cache audio data for ${soundPath}:`, error);
            // Fallback to original path if caching fails
            return soundPath;
        }
    }

    removePositionalSound(id: string) {
        const sound = soundState.positionalSounds.get(id);
        if (sound) {
            sound.audioElement.pause();
            sound.audioElement.removeAttribute('src');
            sound.audioElement.load(); // Force cleanup of audio resources
            sound.isPlaying = false;
            soundState.positionalSounds.delete(id);
        }

        // Clean up audio nodes
        const gainNode = this.gainNodes.get(id);
        const pannerNode = this.pannerNodes.get(id);

        if (gainNode) {
            gainNode.disconnect();
            this.gainNodes.delete(id);
        }

        if (pannerNode) {
            pannerNode.disconnect();
            this.pannerNodes.delete(id);
        }
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

        this.pauseSounds();
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
            sound.audioElement.removeAttribute('src');
            sound.audioElement.load();
        });

        soundState.positionalSounds.clear();

        // Clean up audio nodes
        this.gainNodes.forEach(node => node.disconnect());
        this.pannerNodes.forEach(node => node.disconnect());
        this.gainNodes.clear();
        this.pannerNodes.clear();

        // Clean up cached blob URLs
        this.audioDataCache.forEach(blobUrl => {
            if (blobUrl.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrl);
            }
        });
        this.audioDataCache.clear();
        this.loadingPromises.clear();

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.initialized = false;
    }
}

export const soundService = new SoundService();


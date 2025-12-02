# Sound System Documentation

## Overview

This sound system provides comprehensive audio management for the Driftlands game, including background music with crossfading and positional audio that responds to distance and camera position.

## Features

### 🎵 Background Music
- **Crossfading**: Smooth transitions between tracks (configurable fade time)
- **Automatic biome-based music**: Music changes based on camera location and terrain
- **Volume controls**: Separate master, music, and effects volume controls
- **Pause/resume**: Automatically pauses when game is paused

### 🔊 Positional Audio  
- **Distance-based volume**: Sound fades based on distance from camera
- **Stereo panning**: Left/right audio positioning based on relative position to camera
- **Automatic cleanup**: Sounds are automatically removed when tasks complete or are cancelled
- **Configurable range**: Each sound can have its own maximum audible distance

## Usage

### Setting Background Music

```typescript
import { setBackgroundMusic, stopBackgroundMusic } from '../store/soundStore';

// Play music with crossfade (default)
await setBackgroundMusic('/path/to/music.mp3');

// Play music without crossfade
await setBackgroundMusic('/path/to/music.mp3', false);

// Stop music
stopBackgroundMusic();
```

### Playing Positional Sounds

```typescript
import { playPositionalSound, removePositionalSound } from '../store/soundStore';

// Play a sound at specific hex coordinates
await playPositionalSound(
    'unique-sound-id',
    '/path/to/sound.wav',
    hexQ, 
    hexR,
    {
        baseVolume: 0.8,      // Volume when at position (0-1)
        maxDistance: 15,      // Max hex distance to hear sound
        loop: true            // Whether to loop the sound
    }
);

// Remove/stop a positional sound
removePositionalSound('unique-sound-id');

// Update sound position (for moving sounds)
updateSoundPosition('unique-sound-id', newQ, newR);
```

### Volume Controls

```typescript
import { 
    setMasterVolume, 
    setMusicVolume, 
    setEffectsVolume, 
    toggleSound 
} from '../store/soundStore';

setMasterVolume(0.7);   // 70% master volume
setMusicVolume(0.8);    // 80% music volume  
setEffectsVolume(1.0);  // 100% effects volume
toggleSound(false);     // Disable all sound
```

## Task Integration

Tasks can automatically play sounds during their lifecycle:

```typescript
const exampleTask: TaskDefinition = {
    // ... other task properties
    
    onStart(tile, participants) {
        const soundId = `task-${tile.q}-${tile.r}`;
        playPositionalSound(
            soundId,
            '/src/assets/sounds/task-sound.wav',
            tile.q,
            tile.r,
            { baseVolume: 0.6, maxDistance: 15, loop: true }
        );
    },

    onComplete(tile, instance, participants) {
        const soundId = `task-${tile.q}-${tile.r}`;
        removePositionalSound(soundId);
    }
};
```

## Music Manager

The music manager automatically handles biome-based music:

- **Title screen**: Plays title theme music
- **Forest areas**: Plays forest ambient music  
- **Desert areas**: Plays desert music
- **Mountain areas**: Plays mountain music
- **Default**: Falls back to ambient exploration music

Music files should be placed in: `/src/assets/sounds/music/`

Expected files:
- `title-theme.mp3`
- `ambient-exploration.mp3` 
- `forest-theme.mp3`
- `desert-theme.mp3`
- `mountain-theme.mp3`
- `action-theme.mp3`

## Settings & Persistence

Sound settings are automatically saved to localStorage and restored on game load:

- Master volume
- Music volume  
- Effects volume
- Sound enabled/disabled state

## Testing

Press 'S' during gameplay to open the Sound Demo panel, which provides:

- Volume sliders for testing
- Buttons to test positional audio at different distances
- Real-time information about active sounds
- Music controls for testing

## Technical Details

### Audio Context
- Uses Web Audio API for advanced features
- Supports stereo panning and gain control
- Gracefully falls back if audio context fails to initialize

### Performance
- Positional audio updates at 30 FPS
- Sounds automatically pause when too far away
- Efficient cleanup prevents memory leaks

### Browser Compatibility
- Requires user interaction to start audio (browser security)
- Falls back gracefully on older browsers
- Handles audio context suspension/resume

## Adding New Sounds

1. Place audio files in `/src/assets/sounds/`
2. For music: `/src/assets/sounds/music/`
3. Use relative paths starting with `/src/assets/sounds/`
4. Supported formats: MP3, WAV, OGG

## Configuration

Sound system settings can be modified in `soundService.ts`:

```typescript
export const soundState: SoundState = reactive({
    masterVolume: 0.7,           // Default master volume
    musicVolume: 0.8,            // Default music volume
    effectsVolume: 1.0,          // Default effects volume
    musicCrossfadeTime: 2000,    // Crossfade duration (ms)
    maxAudioDistance: 20,        // Global max audio distance
    panningStrength: 0.7,        // Stereo panning strength (0-1)
    // ...
});
```

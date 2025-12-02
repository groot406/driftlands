# Driftlands Music System

## Overview
The game now uses a **playlist system** instead of biome-specific music. This means:
- Multiple music tracks cycle automatically during gameplay
- Each track plays for approximately 3.5 minutes before switching to the next
- After the last track finishes, the playlist loops back to the first track
- Title screen uses dedicated title music

## Adding New Music Tracks

### Step 1: Add Music Files
Place your music files in the `/src/assets/sounds/music/` folder.
Supported formats: MP3, WAV, OGG

### Step 2: Update the Playlist
Edit `/src/core/musicManager.ts` and add your new tracks to the `MUSIC_PLAYLIST` array:

```typescript
const MUSIC_PLAYLIST = [
    '/src/assets/sounds/music/Peaceful Frontier.mp3',
    '/src/assets/sounds/music/Your New Track.mp3',        // Add this line
    '/src/assets/sounds/music/Another Track.mp3',         // Add this line
    // Add more tracks as needed
] as const;
```

### Step 3: Test
Run the game and the new tracks will automatically be included in the rotation.

## Features

### Automatic Crossfading
- Smooth transitions between tracks
- Configurable fade time in the sound settings

### No Manual Control Needed
- The playlist progresses automatically
- No need to manually switch tracks
- Console logging shows which track is currently playing

### Separate Title Music
- Title screen music is separate from gameplay playlist
- Easy to customize by changing the `TITLE_MUSIC` constant

## Music Recommendations

For best results:
- **Track Length**: 2-5 minutes per track works well
- **Volume Levels**: Normalize all tracks to similar volume levels
- **Loop Points**: Tracks don't need to loop perfectly since they change automatically
- **Genres**: Consider varied but cohesive styles that fit the game atmosphere

## Technical Notes

- Tracks play in the exact order they appear in the array
- The system automatically handles playlist looping
- If a track fails to load, it skips to the next track
- The current implementation uses a fixed 3.5-minute timer per track (can be adjusted in the code)

## Current Status

Currently configured with:
- 1 track: "Peaceful Frontier.mp3"
- Ready to accept additional tracks as you add them

Just add more music files and update the array - that's it!

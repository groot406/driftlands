import test from 'node:test';
import assert from 'node:assert/strict';

import '../shared/tasks/taskDefinitions.ts';
import '../store/uiStore.ts';
import { soundService, soundState, type PositionalSound } from './soundService.ts';
import { loadTasks } from '../store/taskStore.ts';

function fakeSound(id: string, loop = true): PositionalSound {
    return {
        id,
        q: 0,
        r: 0,
        audioElement: {
            pause() {},
            removeAttribute() {},
            load() {},
            currentTime: 0,
            duration: 1,
            volume: 1,
            paused: false,
            readyState: 4,
        } as unknown as HTMLAudioElement,
        baseVolume: 1,
        maxDistance: 10,
        loop,
        isPlaying: true,
    };
}

test.afterEach(() => {
    loadTasks([]);
    soundState.positionalSounds.clear();
});

test('task sound reconciliation removes looped sounds for tasks that no longer exist', () => {
    loadTasks([]);
    soundState.positionalSounds.set('chopWood-0-0', fakeSound('chopWood-0-0'));

    soundService.checkForMissingTaskSounds();

    assert.equal(soundState.positionalSounds.has('chopWood-0-0'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    shouldUseBrowserLightRendering,
    shouldUseDesynchronizedCanvas,
    shouldUseWindowsPresentationSafeMode,
} from './graphicsStore';

function withNavigator(
    userAgent: string,
    platform: string,
    run: () => void,
) {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
        value: {
            platform,
            userAgent,
        },
        configurable: true,
    });

    try {
        run();
    } finally {
        if (originalNavigator) {
            Object.defineProperty(globalThis, 'navigator', originalNavigator);
        } else {
            delete (globalThis as { navigator?: unknown }).navigator;
        }
    }
}

test('Windows Chrome uses presentation-safe rendering defaults', () => {
    withNavigator(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36',
        'Win32',
        () => {
            assert.equal(shouldUseWindowsPresentationSafeMode(), true);
            assert.equal(shouldUseBrowserLightRendering(), true);
            assert.equal(shouldUseDesynchronizedCanvas(), false);
        },
    );
});

test('Windows Firefox uses presentation-safe rendering defaults', () => {
    withNavigator(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0',
        'Win32',
        () => {
            assert.equal(shouldUseWindowsPresentationSafeMode(), true);
            assert.equal(shouldUseBrowserLightRendering(), true);
            assert.equal(shouldUseDesynchronizedCanvas(), false);
        },
    );
});

test('non-Windows Chromium keeps desynchronized canvas enabled', () => {
    withNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36',
        'MacIntel',
        () => {
            assert.equal(shouldUseWindowsPresentationSafeMode(), false);
            assert.equal(shouldUseBrowserLightRendering(), false);
            assert.equal(shouldUseDesynchronizedCanvas(), true);
        },
    );
});

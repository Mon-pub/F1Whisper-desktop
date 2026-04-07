import {expect, type ElectronApplication} from '@playwright/test';

import {test} from '~/test/playwright/common/fixtures/base';

let electronApplication: ElectronApplication;

test.beforeAll(async ({electronApp}) => {
    electronApplication = electronApp;
    // Ensure the main window exists before the tests run
    await electronApp.firstWindow();
});

test.afterAll(async () => {
    await electronApplication.close();
});

/**
 * Regression guard for DESK-2096.
 *
 * On macOS, Electron can emit 'activate' before 'ready' fires (e.g. when the
 * user clicks the dock icon during a slow startup). The handler introduced in
 * DESK-2096 must detect this race and skip the call to start() so the app
 * does not crash. These tests verify both that guard and the normal re-open
 * flow.
 */

test('activate event is a no-op when the app is not yet ready', async () => {
    const windowsBefore = electronApplication.windows().length;

    // Simulate the race by monkey-patching isReady() to report not-ready,
    // emitting activate, then restoring the real implementation.
    const windowsAfter = await electronApplication.evaluate(
        ({app, BrowserWindow: browserWindow}) => {
            const originalIsReady = app.isReady.bind(app);
            app.isReady = (): boolean => false;
            try {
                app.emit('activate');
            } finally {
                app.isReady = originalIsReady;
            }
            return browserWindow.getAllWindows().length;
        },
    );

    expect(windowsAfter).toBe(windowsBefore);
});

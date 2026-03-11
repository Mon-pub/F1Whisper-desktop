import {expect, type ElectronApplication, type Page} from '@playwright/test';

import {test} from '~/test/playwright/common/fixtures/base';

let electronApplication: ElectronApplication;
let page: Page;

test.beforeAll(async ({electronApp}) => {
    electronApplication = electronApp;
    page = await electronApp.firstWindow();
});

test.afterAll(async () => {
    await electronApplication.close();
});

/**
 * Verify that the Chromium networking stack in our Electron build negotiates post-quantum key
 * exchange (`X25519MLKEM768`) when connecting to a server that supports it.
 *
 * This test uses the CDP Network domain to inspect TLS security details for a fetch request to
 * `https://www.threema.com`, which is known to support `X25519MLKEM768`.
 */
test('Assert post-quantum TLS key exchange (X25519MLKEM768)', async () => {
    test.setTimeout(30_000);

    // Arrange
    const url = 'https://threema.com/en';

    // Open a CDP session and enable the Network domain.
    const context = electronApplication.context();
    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('Network.enable');

    // Set up CDP network response listener.
    const securityDetailsPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(
                new Error('Timed out waiting for Network.responseReceived with security details'),
            );
        }, 15_000);

        cdpSession.on('Network.responseReceived', (params: Record<string, unknown>) => {
            const response = params.response as {
                url: string;
                // eslint-disable-next-line @typescript-eslint/no-restricted-types
                securityDetails: Record<string, unknown> | null;
            };

            // Note: If the server redirects `url` to a different destination, the `response.url`
            // will be different, causing the test to fail.
            if (response.url === url && response.securityDetails !== null) {
                clearTimeout(timeout);
                resolve(response.securityDetails);
            }
        });
    });

    // Act
    const consoleMessages: string[] = [];
    page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
    try {
        await page.evaluate(
            async ([urlToFetch]) => {
                // Fetch URL from the renderer context.
                await fetch(urlToFetch, {mode: 'no-cors'});
            },
            [url] as const,
        );
    } catch (error) {
        const details =
            consoleMessages.length > 0
                ? `\nConsole output:\n${consoleMessages.join('\n')}`
                : '\nNo console output captured.';
        throw new Error(`fetch failed${details}`, {cause: error});
    }
    const securityDetails = await securityDetailsPromise;

    // Assert
    expect(securityDetails.protocol).toBe('TLS 1.3');
    expect(securityDetails.keyExchangeGroup).toBe('X25519MLKEM768');

    // Clean up
    await cdpSession.detach();
});

import {expect, test} from '@playwright/test';

import {HomePage} from '~/test/playwright/pages/home.page';

test('Serves a Content Security Policy', async ({request}) => {
    // Act
    const response = await request.get('/');

    // Assert
    expect(response.status()).toBe(200);
    expect(response.headers()['content-security-policy']).toBeTruthy();
});

test('Loading the app does not violate the Content Security Policy', async ({page}) => {
    // Arrange
    const violations: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
            violations.push(message.text());
        }
    });
    const homePage = new HomePage(page);

    // Act
    await homePage.goto();
    // Wait until all assets have been loaded: Navigating only waits for the `load` event, which
    // does not cover web fonts, and assets may be requested even after that.
    await page.evaluate(async () => {
        await document.fonts.ready;
    });
    await page.waitForLoadState('networkidle');

    // Assert
    await expect(homePage.heading).toBeVisible();
    expect(violations).toStrictEqual([]);
});

import {expect, test, type Page} from '@playwright/test';

import {HomePage} from '~/test/playwright/pages/home.page';

let page: Page;
let homePage: HomePage;

test.beforeAll(async ({browser}) => {
    page = await browser.newPage();
    homePage = new HomePage(page);
    await homePage.goto();
});

test.afterAll(async () => {
    await page.close();
});

test('Displays the welcome heading and call-to-action buttons', async () => {
    await expect(homePage.heading).toBeVisible();
    await expect(homePage.joinCallButton).toBeVisible();
    await expect(homePage.learnMoreButton).toBeVisible();
});

test('Switching the branding updates the data-branding attribute', async () => {
    // Arrange
    await homePage.selectBranding('consumer');
    expect(await homePage.currentBranding()).toBe('consumer');

    // Act
    await homePage.selectBranding('work');

    // Assert
    expect(await homePage.currentBranding()).toBe('work');
});

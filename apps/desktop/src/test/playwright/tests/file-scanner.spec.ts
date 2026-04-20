import {expect, type ElectronApplication, type Page} from '@playwright/test';

import {test} from '~/test/playwright/common/fixtures/base';
import {ConversationPage} from '~/test/playwright/pages/conversation.page';

let electronApplication: ElectronApplication;
let page: Page;
let conversationPage: ConversationPage;

test.beforeAll(async ({electronApp}) => {
    electronApplication = electronApp;
    page = await electronApp.firstWindow();
    conversationPage = new ConversationPage(page);

    await conversationPage.goto();
    await conversationPage.unlockApp();
});

test.afterAll(async () => {
    await electronApplication.close();
});

test('File scanner no-op allows inbound txt attachment to download successfully', async () => {
    // Arrange
    const fileName = 'scanner-test.txt';
    const fileBuffer = Buffer.from('File scanner extension-point test payload.');

    // Arrange: Set auto-download incoming media to never download
    await page.getByRole('button', {name: 'more_vert'}).click();
    await page.getByRole('button', {name: 'Settings'}).click();
    await page.getByRole('button', {name: 'Media and Storage'}).click();
    await page.getByRole('button', {name: 'Auto-Download Incoming Media'}).click();
    await page.getByRole('button', {name: 'Never download'}).click();
    await page.getByRole('button', {name: 'arrow_back'}).click();

    // Act
    await conversationPage.addContact('ECHOECHO');
    await expect(page.getByPlaceholder('Write a message')).toBeVisible();
    await conversationPage.dropFileIntoConversation(fileBuffer, fileName, 'text/plain');
    await expect(page.getByText('Send File to ECHOECHO')).toBeVisible();
    await page.getByRole('button', {name: 'arrow_upward'}).first().click();

    // Assert
    const outbound = page.locator('.outbound').last();
    await expect(outbound.locator('.file')).toBeVisible();
    await expect(outbound.getByText(fileName)).toBeVisible();

    // Wait for ECHOECHO to echo the file back as an unsynced inbound message
    const inbound = page.locator('.inbound').last();
    await expect(inbound.locator('.file')).toBeVisible();
    await expect(inbound.getByText(fileName)).toBeVisible();

    // Act
    await page.getByRole('button', {name: 'file_download'}).click();

    // Assert: file download button disappears and no error toast appears, confirming the scanner allowed the
    // file through and the download completed in the synced state
    await expect(page.getByRole('button', {name: 'file_download'})).not.toBeVisible();
    await expect(page.getByText('Data could not be downloaded')).not.toBeVisible();
});

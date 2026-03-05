import path from 'node:path';

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
    await conversationPage.addContact('ECHOECHO');
});

test.afterAll(async () => {
    await electronApplication.close();
});

test('Send message', async ({screenshotPath}) => {
    // Arrange
    await conversationPage.gotoConversation('ECHOECHO');
    const message = `Test message at ${new Date().toISOString()}`;

    // Act
    await conversationPage.sendMessage(message);

    // Assert
    const element = page.locator('.inbound').last();
    await expect(element.getByText(message)).toBeVisible();

    await page.screenshot({path: path.join(screenshotPath, 'assert_send_message.png')});
});

test('Delete last message', async ({screenshotPath}) => {
    // Arrange
    await conversationPage.gotoConversation('ECHOECHO');
    const message = `Test message at ${new Date().toISOString()}`;
    await conversationPage.sendMessage(message);
    const inbound = page.locator('.inbound').last();
    await expect(inbound.getByText(message)).toBeVisible();

    // Act
    await conversationPage.deleteMessage(message);

    // Assert
    const outbound = page.locator('.outbound');
    await expect(outbound.getByText(message)).toBeHidden();

    await page.screenshot({path: path.join(screenshotPath, 'assert_delete_last_message.png')});
});

test('Open emoji picker by clicking on emoji icon', async () => {
    // Arrange
    const emojiIconSpan = page.getByRole('button', {name: 'insert_emoticon'}).locator('span.icon');
    const emojiPicker = page.locator('.emoji-picker');

    // Act – open: click the MdIcon <span> specifically
    await emojiIconSpan.click();

    // Assert
    await expect(emojiPicker.last()).toBeVisible();

    // Act
    await emojiIconSpan.click();

    // Assert
    await expect(emojiPicker.last()).toBeHidden();
    await conversationPage.goto();
});

test('Send pre-recorded wav file as file instead of audio message', async () => {
    // Act
    await conversationPage.addContact('024FVZKE');
    await conversationPage.dropFileIntoConversation(
        conversationPage.generateTestWav(),
        'test.wav',
        'audio/wav',
    );
    await expect(page.getByText('Send File to 024FVZKE')).toBeVisible();
    await page.getByRole('button', {name: 'arrow_upward'}).first().click();

    // Assert
    const outbound = page.locator('.outbound').first();
    await expect(outbound.locator('.file')).toBeVisible();
    await expect(outbound.getByText('test.wav')).toBeVisible();
    await expect(outbound.locator('.audio')).not.toBeVisible();
});

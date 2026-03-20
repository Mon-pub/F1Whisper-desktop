import {expect, type ElectronApplication, type Page} from '@playwright/test';

import testIds from '~/test/playwright/common/data/test_ids.json' with {type: 'json'};
import {test} from '~/test/playwright/common/fixtures/base';
import {ConversationPage} from '~/test/playwright/pages/conversation.page';

const GROUP_NAME = 'Test Group';

let electronApplication: ElectronApplication;
let page: Page;
let conversationPage: ConversationPage;

test.beforeAll(async ({electronApp}) => {
    electronApplication = electronApp;
    page = await electronApp.firstWindow();
    conversationPage = new ConversationPage(page);
    await conversationPage.unlockApp();
    await conversationPage.goto();
});

test.afterAll(async () => {
    await electronApplication.close();
});

// This test takes too long for it to be in the CI, should be run manually when needed.
test.skip('Send message to group', async () => {
    test.setTimeout(300_000);

    // Arrange
    await conversationPage.addMultipleContacts(testIds.join(','));
    await expect(page.getByText('Contacts')).toBeVisible({timeout: 300_000});
    await conversationPage.addGroup(GROUP_NAME, testIds);
    await conversationPage.gotoConversation(GROUP_NAME);
    const message = `Test message at ${new Date().toISOString()}`;

    // Act
    await conversationPage.sendMessage(message);

    // Assert
    const element = page.locator('.outbound').last();
    await expect(element.getByText(message).last()).toBeVisible();
});

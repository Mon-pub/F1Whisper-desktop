/**
 * These are not real tests but used for the sole purpose of generating screenshots.
 */
import path from 'node:path';

import type {ElectronApplication, Page} from '@playwright/test';

import {test} from '~/test/playwright/common/fixtures/base';
import {
    generateCombinations,
    SEARCH_EXPRESSIONS,
    type ScreenshotConfiguration,
} from '~/test/playwright/common/utils/screenshot-utils';
import {ConversationPage} from '~/test/playwright/pages/conversation.page';
import {SettingsPage} from '~/test/playwright/pages/settings.page';

let electronApplication: ElectronApplication;
let page: Page;
let conversationPage: ConversationPage;
let settingsPage: SettingsPage;

function generateTest(testConfiguration: ScreenshotConfiguration) {
    return () => {
        test.describe(`Screenshots ${testConfiguration.language} ${testConfiguration.mode}`, () => {
            let imageNameSuffix: string;
            test.beforeAll(async ({currentVersion, buildVariant, electronApp}) => {
                electronApplication = electronApp;
                page = await electronApp.firstWindow();
                imageNameSuffix = `${buildVariant}-${testConfiguration.language}-${testConfiguration.mode}`;
                conversationPage = new ConversationPage(page);

                await conversationPage.goto();

                settingsPage = new SettingsPage(page);

                await settingsPage.goto();

                await settingsPage.changeTheme(testConfiguration.mode);

                await settingsPage.changeLanguage(testConfiguration.language);

                await settingsPage.gotoAboutThreema();

                await settingsPage.generateScreenshotData(currentVersion);

                await conversationPage.goto();
                // Make sure to load all conversations
                await page.waitForTimeout(1000);
            });

            test(`welcome screen ${testConfiguration.language} ${testConfiguration.mode}`, async ({
                screenshotPath,
            }) => {
                await page.screenshot({
                    path: path.join(screenshotPath, `home-screen-${imageNameSuffix}.png`),
                });
            });

            test(`Hanna Schmidt Chat ${testConfiguration.language} ${testConfiguration.mode} `, async function ({
                screenshotPath,
            }) {
                await page
                    .getByRole('button', {
                        name: 'Hanna Schmidt Hanna Schmidt',
                    })
                    .click();
                // Make sure that all images are fully loaded
                await page.waitForTimeout(1000);

                await page.screenshot({
                    path: path.join(screenshotPath, `hanna-chat-${imageNameSuffix}.png`),
                });
            });

            test(`Foodies Chat ${testConfiguration.language} ${testConfiguration.mode}`, async function ({
                screenshotPath,
                buildVariant,
            }) {
                // In work builds, Peter Schreiner writes the chat
                const lastMessageSender =
                    buildVariant === 'consumer' ? 'Hanna Schmidt' : 'Peter Schreiner';
                await page
                    .getByRole('button', {
                        name: `Foodies Foodies ${lastMessageSender}`,
                    })
                    .click();
                // Make sure that all images are fully loaded
                await page.waitForTimeout(1000);
                await page.screenshot({
                    path: path.join(screenshotPath, `foodies-chat-${imageNameSuffix}.png`),
                });
            });

            test(`Foodies Chat Emoji Picker ${testConfiguration.language} ${testConfiguration.mode}`, async function ({
                screenshotPath,
            }) {
                await page.getByRole('button', {name: 'insert_emoticon'}).click();
                await page.screenshot({
                    path: path.join(
                        screenshotPath,
                        `foodies-chat-emoji-picker-${imageNameSuffix}.png`,
                    ),
                });
                await page.getByRole('button', {name: 'insert_emoticon'}).click();
            });

            test(`Foodies Chat Sidebar ${testConfiguration.language} ${testConfiguration.mode}`, async function ({
                screenshotPath,
                buildVariant,
            }) {
                // Work and consumer differ ehre, too
                const groupMemberList =
                    buildVariant === 'consumer'
                        ? 'Hanna Schmidt, Lisa Goldman, Roberto Diaz'
                        : 'Lisa Goldman, Peter Schreiner, Roberto Diaz';
                await page
                    .getByRole('button', {
                        name: groupMemberList,
                    })
                    .click();
                await page.screenshot({
                    path: path.join(screenshotPath, `foodies-chat-sidebar-${imageNameSuffix}.png`),
                });
            });

            test(`Foodies Chat Contact List ${testConfiguration.language} ${testConfiguration.mode}`, async function ({
                screenshotPath,
            }) {
                await page.getByRole('button', {name: 'person_outline'}).click();
                await page.screenshot({
                    path: path.join(
                        screenshotPath,
                        `foodies-chat-contact-list-${imageNameSuffix}.png`,
                    ),
                });
            });

            test(`Settings Profile ${testConfiguration.language} ${testConfiguration.mode}`, async function ({
                screenshotPath,
            }) {
                await settingsPage.goto();
                await page.screenshot({
                    path: path.join(screenshotPath, `settings-profile-${imageNameSuffix}.png`),
                });
            });

            test(`Settings Appearance  ${testConfiguration.language} ${testConfiguration.mode}`, async function ({
                screenshotPath,
            }) {
                await page.getByRole('button', {name: 'palette'}).click();
                await page.screenshot({
                    path: path.join(screenshotPath, `settings-appearance-${imageNameSuffix}.png`),
                });
            });

            test(`Search ${testConfiguration.language} ${testConfiguration.mode}`, async function ({
                screenshotPath,
                buildVariant,
            }) {
                await conversationPage.goto();

                // In work builds, Peter Schreiner writes the chat
                const lastMessageSender =
                    buildVariant === 'consumer' ? 'Hanna Schmidt' : 'Peter Schreiner';
                await page
                    .getByRole('button', {
                        name: `Foodies Foodies ${lastMessageSender}`,
                    })
                    .click();
                // Make sure that all images are fully loaded
                await page.waitForTimeout(1000);
                await page
                    .getByPlaceholder(SEARCH_EXPRESSIONS[testConfiguration.language].searchName)
                    .click();

                // Workaround because directly copying doesn't work in global search
                await page
                    .getByPlaceholder(SEARCH_EXPRESSIONS[testConfiguration.language].searchName)
                    .pressSequentially(SEARCH_EXPRESSIONS[testConfiguration.language].searchTerm);

                await page.screenshot({
                    path: path.join(screenshotPath, `search-${imageNameSuffix}.png`),
                });
            });

            test.afterAll(async () => {
                await electronApplication.close();
            });
        });
    };
}

const combinations = generateCombinations();
for (const combination of combinations) {
    generateTest(combination)();
}

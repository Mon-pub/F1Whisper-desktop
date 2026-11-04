import fs from 'node:fs';
import path from 'node:path';

import {expect, type ElectronApplication, type Locator, type Page} from '@playwright/test';

import {test} from '~/test/playwright/common/fixtures/base';
import {ConversationPage} from '~/test/playwright/pages/conversation.page';

/**
 * A 10 s, 640x480 video consisting of solid colour bands:
 *
 * Note: The bands are wide enough to absorb the duration drift introduced by the outbound
 * transcoding step.
 */
const FIXTURE_PATH = path.resolve(
    path.join('src', 'test', 'playwright', 'common', 'data', 'thumbnail-bands.mp4'),
);

/**
 * By how much (per 0-255 channel) one colour channel must exceed another to count as dominant.
 */
const CHANNEL_DOMINANCE_MARGIN = 60;

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

async function centerPixel(
    img: Locator,
): Promise<{red: number; green: number; blue: number; width: number}> {
    return await img.evaluate(async (imgElement: HTMLImageElement) => {
        await imgElement.decode();
        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;

        const context = canvas.getContext('2d');
        if (context === null) {
            throw Error('Unable to get a drawing canvas.');
        }
        context.drawImage(imgElement, 0, 0);

        const {
            data: [red, green, blue],
        } = context.getImageData(
            Math.floor(imgElement.naturalWidth / 2),
            Math.floor(imgElement.naturalHeight / 2),
            1,
            1,
        );
        if (red === undefined || green === undefined || blue === undefined) {
            throw Error('Unable to get thumbnail colors');
        }
        return {red, green, blue, width: imgElement.naturalWidth};
    });
}

test('Inbound video thumbnail is regenerated from the actual video bytes', async () => {
    // Arrange: never auto-download, so we can observe before/after
    await conversationPage.setAutoDownload('never');
    await conversationPage.addContact('ECHOECHO');

    // Act: send the fixture, wait for ECHOECHO to echo it back
    await conversationPage.dropFileIntoConversation(
        fs.readFileSync(FIXTURE_PATH),
        'thumbnail-bands.mp4',
        'video/mp4',
    );
    await page.getByRole('button', {name: 'arrow_upward'}).first().click();

    const inbound = page.locator('.inbound').last();
    const thumbnail = inbound.locator('.thumbnail img');
    await expect(thumbnail).toBeVisible();

    // Assert (before): sender's thumbnail, capped at CSP_THUMBNAIL_MAX_SIZE
    const before = await centerPixel(thumbnail);
    expect(before.width).toBeLessThanOrEqual(512);

    // Act: trigger the video download -> runs thumbnail regeneration
    await page.getByRole('button', {name: 'file_download'}).click();

    // Assert (after): regenerated at full video resolution
    await expect
        .poll(async () => (await centerPixel(thumbnail)).width, {timeout: 30_000})
        .toBe(640);

    // Assert (after): the regenerated thumbnail shows the frame at 10 % of the video, which falls
    // into the fixture's lime (#00FF00) band.
    //
    // Note: We assert that green dominates both other channels rather than comparing exact RGB
    // values. A wrongly picked frame therefore fails whichever band it came from.
    const after = await centerPixel(thumbnail);
    expect(after.green).toBeGreaterThan(after.red + CHANNEL_DOMINANCE_MARGIN);
    expect(after.green).toBeGreaterThan(after.blue + CHANNEL_DOMINANCE_MARGIN);
});

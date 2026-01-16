import type {ElectronFixture} from '~/test/playwright/common/types/electron-fixture';
import {LoginPage} from '~/test/playwright/pages/login.page';

import {test as base} from './base';

export const test = base.extend<ElectronFixture>({
    electronApp: async ({electronApp}, use) => {
        if (process.env.PLAYWRIGHT_PASSWORD === undefined) {
            throw new Error(`No password set, please export as env var (PLAYWRIGHT_PASSWORD).`);
        }

        const page = await electronApp.firstWindow();
        const loginPage = new LoginPage(page);
        await loginPage.login(process.env.PLAYWRIGHT_PASSWORD);

        await use(electronApp);
    },
});

import type {Page} from '@playwright/test';

import type {ScreenshotConfiguration} from '~/test/playwright/common/utils/screenshot-utils';
import {rootUrl} from '~/test/playwright/config';

export class SettingsPage {
    private readonly _page: Page;

    public constructor(page: Page) {
        this._page = page;
    }

    public async goto(): Promise<void> {
        await this._page.goto(rootUrl);
        await this._page.getByRole('button', {name: 'more_vert'}).click();
        await this._page.getByRole('button', {name: 'settings'}).click();
    }

    public async gotoAboutThreema(): Promise<void> {
        await this._page.getByRole('button', {name: 'info'}).click();
    }

    public async unlockApp(): Promise<void> {
        await this._page.getByText('App Password', {exact: true}).fill('CHANGE_ME');
        await this._page.getByRole('button', {name: 'Continue'}).click();
    }

    public async changeTheme(theme: ScreenshotConfiguration['mode']): Promise<void> {
        await this._page.getByRole('button', {name: 'palette'}).click();
        await this._page.getByRole('button', {name: 'Theme System expand_more'}).click();
        await this._page.getByRole('button', {name: theme}).click();
    }

    /**
     * Note: For this to work, the language must currently be English.
     */
    public async changeLanguage(language: ScreenshotConfiguration['language']): Promise<void> {
        await this._page.getByRole('button', {name: 'palette'}).click();
        await this._page.getByRole('button', {name: 'Language English expand_more'}).click();
        await this._page.getByRole('button', {name: language, exact: true}).click();
    }

    /**
     * Note: For this to work, the language must currently be English.
     */
    public async generateScreenshotData(version: string): Promise<void> {
        await this._page.getByText(version).click();
        await this._page.getByText(version).click({
            clickCount: 5,
        });
        await this._page.getByRole('button', {name: 'bug_report'}).click();

        await this._page.getByRole('button', {name: 'Network'}).click();
        await this._page.getByRole('button', {name: 'Storage', exact: true}).click();
        await this._page.getByRole('button', {name: 'auto_fix_normal Import'}).click();

        // Close debug panel
        await this._page.getByRole('button', {name: 'bug_report'}).click();

        // Wait 7 seconds until "you are a developer" is gone
        await this._page.waitForTimeout(7000);
    }
}

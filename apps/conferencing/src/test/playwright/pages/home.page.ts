import type {Locator, Page} from '@playwright/test';

export class HomePage {
    public readonly heading: Locator;
    public readonly joinCallButton: Locator;
    public readonly learnMoreButton: Locator;
    public readonly brandingSelect: Locator;

    private readonly _page: Page;

    public constructor(page: Page) {
        this._page = page;
        this.heading = page.getByRole('heading', {name: 'Threema Conferencing'});
        this.joinCallButton = page.getByRole('button', {name: 'Join Call'});
        this.learnMoreButton = page.getByRole('button', {name: 'Learn More'});
        this.brandingSelect = page.getByLabel('Branding:');
    }

    public async goto(): Promise<void> {
        await this._page.goto('/');
    }

    public async selectBranding(branding: 'consumer' | 'work' | 'onprem'): Promise<void> {
        await this.brandingSelect.selectOption(branding);
    }

    public async currentBranding(): Promise<string | undefined> {
        return (await this._page.locator('html').getAttribute('data-branding')) ?? undefined;
    }
}

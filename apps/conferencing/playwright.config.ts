import {defineConfig, devices} from '@playwright/test';

import {baseUrl} from './src/test/playwright/config';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './src/test/playwright/tests',
    /* Run tests in files sequentially */
    fullyParallel: false,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: process.env.GITLAB_CI === 'true',
    /* Retry on CI only */
    retries: process.env.GITLAB_CI === 'true' ? 2 : 0,
    /* Opt out of parallel tests. */
    workers: 1,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: [['html', {open: 'never'}]],
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        baseURL: baseUrl,
        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },
    /* Configure projects for browser engines */
    projects: [
        {
            name: 'chromium',
            use: {...devices['Desktop Chrome']},
        },
    ],

    /*
     * Start a `vite preview` server before running the tests.
     *
     * Requires the app to have been built first (`pnpm run build`). When
     * running via Turbo this is handled by the `test:playwright` task's
     * `dependsOn` entry.
     */
    webServer: {
        command: 'pnpm run preview',
        url: baseUrl,
        reuseExistingServer: process.env.GITLAB_CI !== 'true',
        timeout: 10_000,
        gracefulShutdown: {signal: 'SIGTERM', timeout: 500},
    },
});

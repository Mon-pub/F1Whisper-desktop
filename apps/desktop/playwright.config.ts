import {defineConfig, devices} from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir:
        process.env.PLAYWRIGHT_SCREENSHOTS !== undefined
            ? './src/test/playwright/screenshots'
            : './src/test/playwright/tests',
    /* Run tests in files sequentially */
    fullyParallel: false,
    /* Folder for test artifacts such as screenshots, videos, traces, etc. */
    outputDir: './build/playwright/test-results',
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
        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },
    /* Configure projects for browser engine used by Electron */
    projects: [
        {
            name: 'chromium',
            use: {...devices['Desktop Chrome']},
        },
    ],

    /*
     * Start the OPPF mock server before the test suite when running OnPrem builds and tear it down afterwards.
     * See `src/test/playwright/mocks/onprem-provisioning-server/` for the server.
     */
    globalSetup: './src/test/playwright/global-setup.ts',
});

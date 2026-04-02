import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        browser: {
            enabled: true,
            instances: [{browser: 'chromium'}],
            provider: playwright({
                launchOptions: {
                    executablePath: process.env.CHROMIUM_BIN,
                },
            }),
        },
        coverage: {
            exclude: ['src/utils/test/**/*'],
            include: ['src/**/*.ts'],
            // Use `istanbul` for coverage, for compatibility with `apps/desktop`.
            provider: 'istanbul',
            thresholds: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                '100': true,
            },
        },
    },
});

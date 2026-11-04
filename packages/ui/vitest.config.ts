import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

/**
 * Size of the Vitest iframe as well as the Playwright window.
 *
 * Note: The two must match. If the page is smaller than the iframe, Vitest scales the iframe down
 * to fit, which means that rendered pixels no longer correspond to CSS pixels.
 */
const VIEWPORT = {width: 1024, height: 768};

export default defineConfig({
    plugins: [
        // Tailwind must come before the Svelte plugin.
        tailwindcss(),
        svelte(),
    ],
    test: {
        include: ['src/**/*.test.ts'],
        browser: {
            enabled: true,
            headless: true,
            instances: [{browser: 'chromium'}],
            provider: playwright({
                contextOptions: {
                    viewport: VIEWPORT,
                },
                launchOptions: {
                    executablePath: process.env.CHROMIUM_BIN,
                },
            }),
            viewport: VIEWPORT,
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
        css: true,
        setupFiles: './vitest.setup.ts',
    },
});

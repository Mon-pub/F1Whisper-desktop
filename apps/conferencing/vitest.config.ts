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
    plugins: [tailwindcss(), svelte()],
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
        passWithNoTests: true,
    },
});

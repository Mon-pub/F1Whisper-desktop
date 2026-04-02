import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

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
        },
        css: true,
        setupFiles: './vitest.setup.ts',
    },
});

import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

export default defineConfig({
    plugins: [tailwindcss(), svelte()],
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
        passWithNoTests: true,
    },
});

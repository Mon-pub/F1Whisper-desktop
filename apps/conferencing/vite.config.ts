import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';

export default defineConfig({
    plugins: [
        // Tailwind must come before the Svelte plugin.
        tailwindcss(),
        svelte(),
    ],
    server: {
        host: '127.0.0.1',
        port: 5173,
        hmr: {
            port: 5173,
            host: '127.0.0.1',
        },
    },
    optimizeDeps: {
        exclude: ['@threema/dom', '@threema/domain', '@threema/ui'],
    },
});

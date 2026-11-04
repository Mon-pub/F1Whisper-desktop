import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.mjs'],
        coverage: {
            include: ['src/**/*.mjs'],
            // The CLI is thin I/O glue around `render.mjs` and is not exercised by the tests.
            exclude: ['src/cli.mjs'],
            // Use `istanbul` for coverage, for compatibility with `apps/desktop`.
            provider: 'istanbul',
            thresholds: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                '100': true,
            },
        },
    },
});

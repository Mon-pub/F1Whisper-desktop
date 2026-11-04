import {getConfig as getCommonConfig} from '@threema/eslint-config';
import {defineConfig, globalIgnores} from 'eslint/config';
import globals from 'globals';

export default defineConfig(
    ...getCommonConfig(import.meta.dirname, {
        projectService: {
            allowDefaultProject: ['eslint.config.mjs', 'vitest.config.ts'],
            defaultProject: 'tsconfig.json',
        },
    }),

    // Note: The test schema fixtures are input data, not sources, and are deliberately not type
    // checked (see also `tsconfig.json`).
    globalIgnores(['.turbo/', 'coverage/', 'node_modules/', 'test/fixtures/']),

    // This package is a Node CLI, so all of its files run in Node and should have access to Node
    // APIs.
    {
        files: ['**/*.mjs'],
        languageOptions: {globals: {...globals.node}},
    },

    // The CLI reports errors and prints its output on the standard streams.
    {
        files: ['src/cli.mjs'],
        rules: {'no-console': 'off'},
    },

    // Allow `devDependencies` in test and config files.
    {
        files: ['test/**/*.mjs', 'vitest.config.ts'],
        rules: {
            'import/no-extraneous-dependencies': [
                'error',
                {devDependencies: true, packageDir: import.meta.dirname},
            ],
            'import/no-unassigned-import': 'off',
        },
    },
);

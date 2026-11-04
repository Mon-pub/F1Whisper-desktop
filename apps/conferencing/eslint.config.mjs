import {getConfig as getCommonConfig, getTypeScriptConfigMixin} from '@threema/eslint-config';
import {defineConfig, globalIgnores} from 'eslint/config';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';

import svelteConfig from './svelte.config.js';

export default defineConfig(
    ...getCommonConfig(import.meta.dirname, {
        projectService: {
            allowDefaultProject: ['eslint.config.mjs', 'svelte.config.js'],
            defaultProject: 'tsconfig.json',
        },
        extraFileExtensions: ['.svelte'],
        svelteConfig,
    }),

    globalIgnores([
        '.turbo/',
        'dist/',
        'build/',
        'node_modules/',
        'playwright-report/',
        'test-results/',
    ]),

    // Allow unassigned CSS imports in app source files.
    {
        files: ['src/**/*.ts'],
        rules: {
            'import/no-unassigned-import': ['error', {allow: ['**/*.css']}],
        },
    },

    // Allow `devDependencies` in config, test, and packaging files.
    {
        files: [
            '**/*.test.ts',
            'eslint.config.mjs',
            'packaging/**/*',
            'playwright.config.ts',
            'src/test/**/*.ts',
            'svelte.config.js',
            'vite.config.ts',
            'vitest.config.ts',
        ],
        rules: {
            'import/no-extraneous-dependencies': [
                'error',
                {
                    devDependencies: true,
                    packageDir: import.meta.dirname,
                },
            ],
            'import/no-unassigned-import': 'off',
        },
    },

    // Packaging scripts are Node ESM scripts and may use `console`.
    {
        files: ['packaging/**/*.mjs'],
        languageOptions: {
            globals: {
                ...globals.nodeBuiltin,
            },
        },
        rules: {'no-console': 'off'},
    },

    {
        files: ['**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                // Use the TypeScript parser for <script> blocks inside .svelte files.
                parser: {ts: '@typescript-eslint/parser'},
                project: 'tsconfig.json',
            },
            globals: {
                ...globals.browser,
            },
        },
        rules: getTypeScriptConfigMixin('svelte', {
            rules: {
                'no-labels': 'off',
                '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
                'import/no-mutable-exports': 'off',
                'prefer-const': [
                    'error',
                    {
                        destructuring: 'all',
                    },
                ],
            },
        }),
    },
);

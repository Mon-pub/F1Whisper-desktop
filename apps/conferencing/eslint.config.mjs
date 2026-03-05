import {getConfig as getCommonConfig, getTypeScriptConfigMixin} from '@threema/eslint-config';
import {defineConfig, globalIgnores} from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
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

    globalIgnores(['.turbo/', 'dist/', 'node_modules/']),

    // Allow unassigned CSS imports in app source files.
    {
        files: ['src/**/*.ts'],
        rules: {
            'import/no-unassigned-import': ['error', {allow: ['**/*.css']}],
        },
    },

    // Allow devDependencies in config and test files.
    {
        files: [
            '**/*.test.ts',
            'eslint.config.mjs',
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
        extends: [svelte.configs['flat/prettier']],
    },
);

import {getConfig as getCommonConfig, getTypeScriptConfigMixin} from '@threema/eslint-config';
import {defineConfig, globalIgnores} from 'eslint/config';
import {configs as storybookConfigs} from 'eslint-plugin-storybook';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';

export default defineConfig(
    ...getCommonConfig(import.meta.dirname, {
        projectService: {
            allowDefaultProject: ['eslint.config.mjs', 'svelte.config.js'],
            defaultProject: 'tsconfig.json',
        },
        extraFileExtensions: ['.svelte'],
    }),

    globalIgnores(['!.storybook', '.turbo/', 'node_modules/']),

    // Storybook plugin rules for `.storybook/**` and `*.stories.{js,ts,...}` files. Note:
    // `*.stories.svelte` files are handled separately further down below; the storybook plugin's
    // file patterns do not cover .svelte files.
    ...storybookConfigs['flat/recommended'],

    // Allow devDependencies in test and config files.
    {
        files: ['**/*.test.ts', 'vitest.config.ts', 'src/utils/test/**'],
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

    // Allow devDependencies in Storybook story and config files.
    {
        files: ['**/*.stories.svelte', '.storybook/**'],
        rules: {
            'import/no-extraneous-dependencies': [
                'error',
                {
                    devDependencies: true,
                    packageDir: import.meta.dirname,
                },
            ],
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
                '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
                'import/no-mutable-exports': 'off',
                'jsdoc/require-jsdoc': 'off',
                'no-labels': 'off',
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

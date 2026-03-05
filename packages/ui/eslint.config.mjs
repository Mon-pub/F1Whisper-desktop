import {getConfig as getCommonConfig, getTypeScriptConfigMixin} from '@threema/eslint-config';
import {defineConfig, globalIgnores} from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

export default defineConfig(
    ...getCommonConfig(import.meta.dirname, {
        projectService: {
            allowDefaultProject: ['eslint.config.mjs'],
            defaultProject: 'tsconfig.json',
        },
        extraFileExtensions: ['.svelte'],
    }),

    globalIgnores(['.turbo/', 'node_modules/']),

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

    {
        files: ['**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                // Use the TypeScript parser for <script> blocks inside .svelte files.
                parser: {ts: '@typescript-eslint/parser'},
                project: 'tsconfig.json',
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

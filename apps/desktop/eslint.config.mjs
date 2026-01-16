import {getConfig as getCommonConfig, getTypeScriptConfigMixin} from '@threema/eslint-config';
import {defineConfig, globalIgnores} from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import {configs} from 'typescript-eslint';
import * as extraFileParser from 'typescript-eslint-parser-for-extra-files';

import svelteConfig from './svelte.config.js';

export default defineConfig(
    ...getCommonConfig(import.meta.dirname, {
        projectService: {
            allowDefaultProject: ['eslint.config.mjs'],
            defaultProject: 'tsconfig.json',
        },
        extraFileExtensions: ['.svelte'],
        svelteConfig,
    }),

    globalIgnores([
        '.nyc_output_karma/',
        '.nyc_output_mocha/',
        '.turbo/',
        'build/',
        'coverage/',
        'docs/book/',
        'junit/',
        'node_modules/',
        'packaging/build/',
        'playwright-report/',
        'src/common/crypto/blake2b/implementation.js',
        'src/common/enum/index.ts',
        'src/common/network/protobuf/js',
    ]),

    // Check that all environment variables used at build time have been whitelisted in the `turbo`
    // config.
    {
        ignores: ['src/**/*', '!src/test/**/*'],
        rules: {
            'turbo/no-undeclared-env-vars': 'error',
        },
    },

    {
        rules: {
            // TODO: Currently broken for e.g. 'sinon' and 'chai' which affects tests, see:
            // https://github.com/import-js/eslint-plugin-import/issues/2168
            'import/no-extraneous-dependencies': [
                'error',
                {
                    devDependencies: [
                        '{config,packaging,test,tools}/**',
                        'eslint.config.mjs',
                        'playwright.config.ts',
                        'svelte.config.js',
                    ],
                    peerDependencies: false,
                    bundledDependencies: false,
                    packageDir: import.meta.dirname,
                },
            ],
        },
    },

    // Non-typescript utility script rules. We disable the type checker here since these files are
    // written in pure js.
    {
        files: ['config/**/*.{cjs,js}', 'src/test/**/*.js', 'tools/**/*.{mjs,cjs,js}'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-console': 'off',
            'prefer-named-capture-group': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-var-requires': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'import/no-default-export': 'off',
            'import/no-extraneous-dependencies': ['error', {devDependencies: true}],
        },
        extends: [configs.disableTypeChecked],
    },

    // Utility script rules
    {
        files: ['config/**/*.ts', 'config/**/base.js', 'tools/**/*.ts', 'playwright.config.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-console': 'off',
            'prefer-named-capture-group': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-var-requires': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'import/no-default-export': 'off',
        },
    },

    {
        files: ['packaging/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: 'packaging/tsconfig.json',
            },
        },
        rules: {
            'no-console': 'off',
        },
    },

    {
        files: ['config/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: 'config/tsconfig.json',
            },
        },
    },

    // App source rules
    {
        files: ['src/app/**'],
        rules: {
            'import/no-unassigned-import': ['error', {allow: ['**/*.scss']}],
        },
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        files: ['src/app/**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                parser: extraFileParser,
                project: 'src/app/tsconfig.json',
            },
        },
        rules: getTypeScriptConfigMixin('svelte', {
            rules: {
                'no-labels': 'off',
                '@typescript-eslint/no-restricted-types': [
                    'off',
                    {
                        types: {
                            // Note: Null often cannot be avoided when dealing with the Svelte lifecycle
                            null: 'off',
                        },
                    },
                ],
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
    {
        files: ['src/app/**/*.ts'],
        languageOptions: {
            parser: /** @type {any} */ (extraFileParser),
            parserOptions: {
                project: 'src/app/tsconfig.json',
            },
        },
    },

    // CLI source rules
    {
        files: ['src/cli/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: 'src/cli/tsconfig.json',
            },
        },
    },

    // Common source rules
    {
        files: ['src/common/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/common/tsconfig.json',
            },
        },
    },
    {
        files: [
            'src/common/network/structbuf/utils.ts',
            'src/common/network/structbuf/{csp,extra,group-call,md-d2d,md-d2d-rendezvous,md-d2m}/**/*.ts',
        ],
        rules: {
            '@typescript-eslint/no-restricted-types': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-extraneous-class': 'off',
            '@typescript-eslint/no-empty-interface': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/naming-convention': 'off',
            'prefer-const': 'off',
            'import/newline-after-import': 'off',
            'import/order': 'off',
        },
    },

    // Common DOM source rules
    {
        files: ['src/common/dom/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                project: 'src/common/dom/tsconfig.json',
            },
        },
    },

    // Common enum source rules
    {
        files: ['src/common/enum/index.ts'],
        rules: {
            '@typescript-eslint/naming-convention': 'off',
            '@typescript-eslint/no-namespace': 'off',
            'jsdoc/require-jsdoc': 'off',
        },
    },

    // Common Node source rules
    {
        files: ['src/common/node/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: 'src/common/node/tsconfig.json',
            },
        },
    },

    // Electron-specific source rules
    {
        files: ['src/electron/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: 'src/electron/tsconfig.json',
            },
        },
    },

    // Enum source rules
    {
        files: ['src/enum/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/enum/tsconfig.json',
            },
        },
        rules: {
            'no-restricted-syntax': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },

    // Backend Worker source rules
    {
        files: ['src/worker/backend/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.worker,
            },
            parserOptions: {
                project: 'src/worker/backend/tsconfig.json',
            },
        },
    },

    // Backend Worker Electron source rules
    {
        files: ['src/worker/backend/electron/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.worker,
            },
            parserOptions: {
                project: 'src/worker/backend/electron/tsconfig.json',
            },
        },
    },

    // Exception for electron-service
    {
        files: ['src/common/dom/electron-service.ts'],
        rules: {
            'threema/ban-direct-electron-access': 'off',
        },
    },

    // Service worker source rules
    {
        files: ['src/service-worker-*.ts'],
        languageOptions: {
            globals: {
                ...globals.serviceworker,
            },
            parserOptions: {
                project: 'src/service-worker-tsconfig.json',
            },
        },
    },
    {
        files: ['src/worker/service/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.serviceworker,
            },
            parserOptions: {
                project: 'src/worker/service/tsconfig.json',
            },
        },
    },

    // General test source rules
    {
        files: ['src/test/**/*.{cjs,js,ts}'],
        rules: {
            'no-console': 'off',
            'func-names': 'off',
            'prefer-arrow-callback': 'off',
            'import/no-default-export': 'off',

            // Mocha requires these.
            '@typescript-eslint/no-invalid-this': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/no-misused-spread': 'off',

            // TODO: Currently broken for e.g. 'sinon' and 'chai' which affects tests, see:
            // https://github.com/import-js/eslint-plugin-import/issues/2168
            'import/no-extraneous-dependencies': 'off',

            'jsdoc/require-jsdoc': 'off',
        },
    },
    {
        files: ['src/test/common/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/test/common/tsconfig.json',
            },
        },
    },

    // Karma test source rules
    {
        files: ['src/test/karma/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/test/karma/tsconfig.json',
            },
        },
    },
    {
        files: ['src/test/karma/app/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/test/karma/app/tsconfig.json',
            },
        },
    },
    {
        files: ['src/test/karma/common/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/test/karma/common/tsconfig.json',
            },
        },
    },
    {
        files: ['src/test/karma/common/dom/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/test/karma/common/dom/tsconfig.json',
            },
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        files: ['src/test/karma/worker/backend/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.worker,
            },
            parserOptions: {
                project: 'src/test/karma/worker/backend/tsconfig.json',
            },
        },
    },
    {
        files: ['src/test/karma/worker/service/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.serviceworker,
            },
            parserOptions: {
                project: 'src/test/karma/worker/service/tsconfig.json',
            },
        },
    },

    // Mocha test source rules
    {
        files: ['src/test/mocha/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/test/mocha/tsconfig.json',
            },
        },
    },
    {
        files: ['src/test/mocha/app/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'src/test/mocha/app/tsconfig.json',
                globals: {
                    ...globals.node,
                },
            },
        },
    },
    {
        files: ['src/test/mocha/common/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: 'src/test/mocha/common/tsconfig.json',
            },
        },
    },

    // Playwright test source rules
    {
        files: ['src/test/playwright/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: 'src/test/playwright/tsconfig.json',
            },
        },
        rules: {
            'no-empty-pattern': 'off', // Used for fixtures
        },
    },
);

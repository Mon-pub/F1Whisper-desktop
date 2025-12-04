import {getConfig as getCommonConfig} from '@threema/eslint-config';
import {defineConfig} from 'eslint/config';

export default defineConfig(
    ...getCommonConfig(import.meta.dirname),

    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: 'tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },

    {
        ignores: ['.turbo/', 'build/', 'node_modules/'],
    },
);

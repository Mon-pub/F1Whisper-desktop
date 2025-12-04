import path from 'node:path';

import {sveltePreprocess} from 'svelte-preprocess';

/**
 * Return the config for svelte-preprocess:
 * https://github.com/sveltejs/svelte-preprocess/blob/main/docs/preprocessing.md
 */
function getSveltePreprocessConfig() {
    return sveltePreprocess({
        // Enable TypeScript preprocessor.
        typescript: {
            tsconfigFile: path.resolve(import.meta.dirname, '..', 'src/app/tsconfig.json'),
        },

        // Enable SCSS preprocessor.
        scss: {
            includePaths: [
                path.resolve(import.meta.dirname, '..', 'src/sass'),
                path.resolve(import.meta.dirname, '..', 'node_modules'),
            ],
        },

        // Disable other preprocessors.
        coffeescript: false,
        globalStyle: false,
        less: false,
        postcss: false,
        pug: false,
        stylus: false,
    });
}

export default getSveltePreprocessConfig;

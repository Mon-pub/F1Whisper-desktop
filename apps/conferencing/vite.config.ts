import fs from 'node:fs';
import path from 'node:path';

import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import {
    SUBRESOURCE_INTEGRITY_JSON_SCHEMA,
    subresourceIntegrityPlugin,
} from '@threema/vite-plugin-subresource-integrity';
import {defineConfig} from 'vite';

/**
 * Extract the HTTP response headers from the `--header` arguments in the `Containerfile.template`,
 * so we use the same in preview mode as in production, and substitute the integrity hash
 * placeholders with the SRI hashes from from `build/subresource-integrity.json`.
 *
 * @returns The headers, keyed by header name.
 * @throws {Error} If the app was not built, or if a placeholder could not be substituted.
 */
function getPreviewHeaders(): Record<string, string> {
    const integrityFile = path.resolve(import.meta.dirname, 'build/subresource-integrity.json');
    if (!fs.existsSync(integrityFile)) {
        throw new Error(
            `File '${integrityFile}' could not be found, the app must be built before previewing it`,
        );
    }

    const {scripts, stylesheets, workers} = SUBRESOURCE_INTEGRITY_JSON_SCHEMA.parse(
        JSON.parse(fs.readFileSync(integrityFile, 'utf8')),
        {mode: 'passthrough'},
    );

    const content = fs
        .readFileSync(path.resolve(import.meta.dirname, 'Containerfile.template'), 'utf8')
        .replaceAll('%SCRIPT_SRC_SRI_HASHES%', scripts.map((digest) => `'${digest}'`).join(' '))
        .replaceAll('%STYLE_SRC_SRI_HASHES%', stylesheets.map((digest) => `'${digest}'`).join(' '))
        .replaceAll('%WORKER_SRC_URIS%', workers.join(' '));

    // Matches any placeholder which was not substituted above.
    const placeholder = /%[A-Z_]+%/u.exec(content)?.[0];
    if (placeholder !== undefined) {
        throw new Error(
            `Placeholder '${placeholder}' in 'Containerfile.template' could not be substituted`,
        );
    }

    return Object.fromEntries(
        [
            ...content.matchAll(
                // Matches the `--header` arguments in the `Containerfile.template`.
                //
                // eslint-disable-next-line threema/ban-stateful-regex-flags
                /^\s*"--header", "(?<name>[^:]+): (?<value>[^"]+)"/gmu,
            ),
        ].flatMap(({groups}) => {
            const {name, value} = groups ?? {};
            return name !== undefined && value !== undefined ? [[name, value] as const] : [];
        }),
    );
}

export default defineConfig(({isPreview}) => ({
    plugins: [
        // Tailwind must come before the Svelte plugin.
        tailwindcss(),
        svelte(),
        // Calculates integrity hashes and adds them to `build/index.html`, as well as
        // `build/subresource-integrity.json`. The hashes are added to the CSP in the
        // `Containerfile`, not here by Vite.
        subresourceIntegrityPlugin({
            appOutDir: 'build',
            // Whitelist of files to add integrity hashes for. All files that are not matched by the
            // following regexes will be blocked from executing at runtime. Note: The regexes must
            // match the path of a file in the output bundle, relative to `appOutDir`.
            htmlEntryPoints: /^index\.html$/u,
            scriptRegExp: /^assets\/index-.{8}\.js$/u,
            stylesheetRegExp: /^assets\/index-.{8}\.css$/u,
        }),
    ],
    build: {
        outDir: 'build',
    },
    preview:
        // Headers are only applied to the preview server, which serves the actual build output and
        // is used by Playwright. The dev server would need `'unsafe-inline'` in `style-src`,
        // because Vite injects CSS by creating `<style>` elements at runtime.
        isPreview === true
            ? {
                  headers: getPreviewHeaders(),
              }
            : undefined,
    server: {
        host: '127.0.0.1',
        port: 5173,
        hmr: {
            port: 5173,
            host: '127.0.0.1',
        },
    },
}));

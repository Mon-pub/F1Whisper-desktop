// @ts-check

/**
 * Build the electron application.
 */
import childProcess from 'node:child_process';
import path from 'node:path';
import process from 'process';

import * as v from '@badrap/valita';

import {
    BUILD_ENVIRONMENT_SCHEMA,
    BUILD_MODE_SCHEMA,
    BUILD_TARGET_SCHEMA,
    BUILD_VARIANT_SCHEMA,
} from './common.mjs';

const ENTRYPOINTS = /** @type {const} */ ([
    'app',
    'electron-preload',
    'screenshare-preload',
    'electron-main',
    'cli',
]);

const TURBO_BUILD_ENV_SCHEMA = v
    .object({
        TURBO_BUILD_ENVIRONMENT: BUILD_ENVIRONMENT_SCHEMA,
        TURBO_BUILD_MODE: BUILD_MODE_SCHEMA.optional(() => 'production'),
        TURBO_BUILD_TARGET: BUILD_TARGET_SCHEMA.optional(() => 'electron'),
        TURBO_BUILD_VARIANT: BUILD_VARIANT_SCHEMA,
    })
    .rest(v.union(v.string(), v.undefined()));

// Determine path of the app's root directory (i.e., an absolute path ending in `apps/desktop`).
const appDir = path.resolve(import.meta.dirname, '..');

// Parse build environment switches.
const config = TURBO_BUILD_ENV_SCHEMA.try(process.env, {mode: 'passthrough'});
if (!config.ok) {
    console.error(`Failed to determine build configuration: ${config.message}`);
    process.exit(1);
}
const {
    TURBO_BUILD_ENVIRONMENT: environment,
    TURBO_BUILD_MODE: mode,
    TURBO_BUILD_TARGET: target,
    TURBO_BUILD_VARIANT: variant,
    ...restConfig
} = config.value;

// Determine git revision (if any).
let gitRevision;
try {
    gitRevision = childProcess
        .execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: appDir,
            encoding: 'utf8',
            timeout: 10000,
        })
        .trim();
    console.info(`Git revision: ${gitRevision}`);
} catch (error) {
    const message = error instanceof Error ? error.message : `${error}`;
    console.warn(`Could not determine git revision: ${message.replace(/\n/u, '\\n')}`);
    gitRevision = '';
}

// Build all `VITE_MAKE` entrypoints.
for (const entry of ENTRYPOINTS) {
    console.info(
        `Building target=${target} variant=${variant} entry=${entry} environment=${environment} mode=${mode}`,
    );

    try {
        childProcess.execFileSync(
            'pnpm',
            ['exec', 'vite', 'build', '-m', mode, '-c', 'config/vite.config.ts'],
            {
                cwd: appDir,
                env: {
                    VITE_MAKE: `${target},${entry},${variant},${environment}`,
                    // Note: Only include GIT_REVISION in sandbox builds in order to support
                    // reproducible builds.
                    GIT_REVISION: environment === 'sandbox' ? gitRevision : '',
                    PATH: restConfig.PATH,
                    SENTRY_DSN: restConfig.SENTRY_DSN,
                    MINIDUMP_ENDPOINT: restConfig.MINIDUMP_ENDPOINT,
                    CUSTOM_CONFIG_PATH: restConfig.CUSTOM_CONFIG_PATH,
                    CUSTOM_CONFIG_INDEX: restConfig.CUSTOM_CONFIG_INDEX,
                },
                stdio: 'pipe',
                encoding: 'utf-8',
            },
        );
    } catch (/** @type {any} */ error) {
        console.error(`\nERROR: Failed to build application:\n${error.stderr}`);
        process.exit(1);
    }
}

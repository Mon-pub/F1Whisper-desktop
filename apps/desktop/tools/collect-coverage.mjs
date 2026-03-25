// @ts-check

/**
 * Collect coverage from Karma and Mocha tests into a single Cobertura report.
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'process';

import * as v from '@badrap/valita';

import {BUILD_ENVIRONMENT_SCHEMA, BUILD_VARIANT_SCHEMA} from './common.mjs';

const COLLECT_COVERAGE_ENV_SCHEMA = v
    .object({
        TURBO_BUILD_ENVIRONMENT: BUILD_ENVIRONMENT_SCHEMA,
        TURBO_BUILD_VARIANT: BUILD_VARIANT_SCHEMA,
    })
    .rest(v.union(v.string(), v.undefined()));

// Determine path of the app's root directory (i.e., an absolute path ending in `apps/desktop`).
const appDir = path.resolve(import.meta.dirname, '..');

// Parse build environment switches.
const config = COLLECT_COVERAGE_ENV_SCHEMA.try(process.env, {mode: 'passthrough'});
if (!config.ok) {
    console.error(`Failed to determine build configuration: ${config.message}`);
    process.exit(1);
}

const {TURBO_BUILD_ENVIRONMENT: environment, TURBO_BUILD_VARIANT: variant} = config.value;
const flavor = `${variant}-${environment}`;
const tempDir = path.join(appDir, '.temp/coverage');

// Clean up and recreate the temp directory.
if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, {recursive: true, force: true});
}
fs.mkdirSync(tempDir, {recursive: true});

// Copy mocha coverage to temp directory.
fs.cpSync(path.join(appDir, `.nyc_output_mocha/${flavor}`), tempDir, {recursive: true});

// Copy karma coverage to temp directory.
fs.copyFileSync(
    path.join(appDir, `.nyc_output_karma/${flavor}/chrome/coverage-final.json`),
    path.join(tempDir, 'karma_coverage_chrome.json'),
);
fs.copyFileSync(
    path.join(appDir, `.nyc_output_karma/${flavor}/firefox/coverage-final.json`),
    path.join(tempDir, 'karma_coverage_firefox.json'),
);

/**
 * Run an nyc subcommand.
 *
 * @param {string[]} args Args for `nyc`.
 */
function runNyc(args) {
    try {
        childProcess.execFileSync('pnpm', ['exec', 'nyc', ...args], {
            cwd: appDir,
            encoding: 'utf-8',
            shell: true,
            stdio: 'inherit',
        });
    } catch (/** @type {any} */ error) {
        console.error(`\nERROR: nyc ${args[0]} failed:\n${error}`);
        process.exit(1);
    }
}

const coverageDir = path.join(appDir, 'coverage');

console.info('Merging the karma and mocha coverage reports');
runNyc(['merge', tempDir, path.join(coverageDir, 'coverage.json')]);

console.info('Generating lcov coverage report');
runNyc(['report', '--reporter=lcov', '--temp-dir', coverageDir]);

console.info('Generating cobertura coverage report');
runNyc(['report', '--reporter=cobertura', '--temp-dir', coverageDir]);

// Cleanup.
fs.rmSync(tempDir, {recursive: true, force: true});
// Remove the `.temp` directory as well if it's empty.
try {
    fs.rmdirSync(path.join(appDir, '.temp'));
} catch {
    // Ignore: directory is not empty or doesn't exist.
}

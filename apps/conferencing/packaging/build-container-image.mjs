/**
 * Build a container image of the conferencing app and export it as a tarball.
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import util from 'node:util';

import {SUBRESOURCE_INTEGRITY_JSON_SCHEMA} from '@threema/vite-plugin-subresource-integrity';

/**
 * Container engines we know how to drive.
 */
const ENGINES = /** @type {const} */ (['docker', 'podman']);

/**
 * @typedef {(typeof ENGINES)[number]} Engine
 */

// Determine path of the app's root directory (i.e., an absolute path ending in
// `apps/conferencing`).
const appDir = path.resolve(import.meta.dirname, '..');

/**
 * Return the usage text, including the path the script was invoked with.
 *
 * @returns {string} The usage text.
 */
function getUsageInfo() {
    const [node, script] = process.argv;

    return `Usage: ${node} ${script} [options]

Options:
  --engine <docker|podman>  Container engine to use (default: docker)
  --help, -h                Show this help`;
}

/**
 * Parse command line arguments.
 *
 * @returns {{readonly engine: Engine}} The parsed options.
 */
function parseArguments() {
    let values;
    try {
        ({values} = util.parseArgs({
            options: {
                engine: {type: 'string', default: 'docker'},
                help: {type: 'boolean', short: 'h', default: false},
            },
            strict: true,
        }));
    } catch (error) {
        const message = error instanceof Error ? error.message : `${error}`;
        fail(`${message}\n\n${getUsageInfo()}`);
    }

    if (values.help === true) {
        console.info(getUsageInfo());
        process.exit(0);
    }

    const engine = ENGINES.find((candidate) => candidate === values.engine);
    if (engine === undefined) {
        fail(
            `Unknown container engine '${values.engine}', expected one of: ${ENGINES.join(
                ', ',
            )}\n\n${getUsageInfo()}`,
        );
    }

    return {engine};
}

/**
 * Determine the version of the app, which is used as the image tag.
 *
 * @returns {string} Version tag of the app from `package.json`.
 */
function determineVersion() {
    const packageJsonFile = fs.readFileSync(path.resolve(appDir, 'package.json'), {
        encoding: 'utf8',
    });
    const version = JSON.parse(packageJsonFile).version;
    if (typeof version !== 'string' || version === '') {
        fail("Could not determine the app version from 'package.json'");
    }

    return version;
}

/**
 * Determine the git revision the image is built from, which is recorded as an image label.
 *
 * Note: `GIT_REVISION` is read from the environment instead of being determined by invoking `git`
 * directly, in order to be included as an input factor in Turborepo's caching strategy.
 *
 * @returns {string | undefined} Shortform git revision, or `undefined` if not provided.
 */
function determineGitRevision() {
    const gitRevision = process.env.GIT_REVISION?.trim();
    if (gitRevision === undefined || gitRevision === '') {
        console.warn(
            'Note: GIT_REVISION is not set, the image will not be labeled with a git revision',
        );
        return undefined;
    }

    return gitRevision;
}

/**
 * Generate the `Containerfile` from `Containerfile.template` by substituting the integrity hash
 * placeholders with the SRI hashes from `build/subresource-integrity.json`.
 */
function generateContainerfile() {
    const integrityFile = path.resolve(appDir, 'build', 'subresource-integrity.json');
    if (!fs.existsSync(integrityFile)) {
        fail(`File 'subresource-integrity.json' could not be found, was the app built?`);
    }

    let sources;
    try {
        sources = SUBRESOURCE_INTEGRITY_JSON_SCHEMA.parse(
            JSON.parse(fs.readFileSync(integrityFile, 'utf8')),
            {mode: 'passthrough'},
        );
    } catch (error) {
        fail(`File 'subresource-integrity.json' is invalid: ${error}`);
    }
    const {scripts, stylesheets, workers} = sources;
    if (scripts.length === 0 || stylesheets.length === 0) {
        fail(
            `Expected at least one script and one stylesheet integrity hash in 'subresource-integrity.json', but got ${scripts.length} and ${stylesheets.length}`,
        );
    }

    const content = fs
        .readFileSync(path.resolve(appDir, 'Containerfile.template'), 'utf8')
        .replaceAll('%SCRIPT_SRC_SRI_HASHES%', scripts.map((digest) => `'${digest}'`).join(' '))
        .replaceAll('%STYLE_SRC_SRI_HASHES%', stylesheets.map((digest) => `'${digest}'`).join(' '))
        .replaceAll('%WORKER_SRC_URIS%', workers.join(' '));

    // Matches any placeholder which was not substituted above.
    const placeholder = /%[A-Z_]+%/u.exec(content)?.[0];
    if (placeholder !== undefined) {
        fail(`Placeholder '${placeholder}' in 'Containerfile.template' could not be substituted`);
    }

    fs.writeFileSync(path.resolve(appDir, 'Containerfile'), content, 'utf8');

    console.info(
        `Generated 'Containerfile' with ${scripts.length} script and ${stylesheets.length} style integrity hashes`,
    );
}

/**
 * Run a command. Aborts the script if the command fails.
 *
 * @param {string} command The command to run.
 * @param {readonly string[]} args The arguments to pass to the command.
 */
function run(command, args) {
    try {
        childProcess.execFileSync(command, args, {
            cwd: appDir,
            encoding: 'utf-8',
            stdio: 'inherit',
        });
    } catch (error) {
        fail(`Command '${command}' failed: ${error}`);
    }
}

/**
 * Print an error message and exit with a non-zero exit code.
 *
 * @param {string} message The error message to print.
 * @returns {never} Never returns.
 */
function fail(message) {
    console.error(`\nERROR: ${message}`);
    process.exit(1);
}

function main() {
    const {engine} = parseArguments();

    // Note: The version from `package.json` is the authoritative release version of the image, and
    // is complemented by the git revision to be able to tell builds of the same version apart. See:
    // https://specs.opencontainers.org/image-spec/annotations/?v=v1.1.1#pre-defined-annotation-keys.
    const version = determineVersion();
    const tag = `threema-conferencing:${version}`;
    const labels = [`org.opencontainers.image.version=${version}`];
    const gitRevision = determineGitRevision();
    if (gitRevision !== undefined) {
        labels.push(`org.opencontainers.image.revision=${gitRevision}`);
    }

    // Generate the final `Containerfile` based on the template.
    generateContainerfile();

    // Build container image from `Containerfile`.
    run(engine, [
        'build',
        '--tag',
        tag,
        ...labels.flatMap((label) => ['--label', label]),
        '--file',
        'Containerfile',
        '.',
    ]);

    // Export the image as a tarball and save it to `dist/image.tar`.
    //
    // Note: The file name is intentionally static, so that every build replaces the previous
    // export. The version and the git revision are recorded in the image itself using the
    // respective tag and labels.
    const tarballPath = path.resolve(appDir, 'dist', 'image.tar');
    fs.mkdirSync(path.dirname(tarballPath), {recursive: true});
    run(engine, ['image', 'save', '--output', tarballPath, tag]);

    console.info(`\nSaved image '${tag}' to ${tarballPath}`);
}

main();

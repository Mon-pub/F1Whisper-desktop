#!/usr/bin/env node
// @ts-check

/**
 * Generate structbuf bindings.
 *
 * By default, the bindings are generated into this package's `src/structbuf` directory. The
 * `--out-dir`, `--base-class` and `--external-import` options allow generating into another
 * location (e.g. the desktop app's source tree).
 */
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

import {readPins} from './metadata.mjs';

/**
 * Run a command and fail if it does not exit cleanly.
 *
 * @param {string} command The executable to run.
 * @param {readonly string[]} args The arguments to pass.
 * @param {import('node:child_process').SpawnSyncOptions} [options] Additional spawn options.
 */
function run(command, args, options = {}) {
    const result = spawnSync(command, args, {stdio: 'inherit', ...options});
    if (result.status !== 0) {
        console.error(`Error: "${command}" exited with status ${result.status}`);
        process.exit(1);
    }
}

/**
 * Return the absolute paths of all files in `directory` matching `extension`.
 *
 * @param {string} directory The directory to scan.
 * @param {string} extension The file name suffix to match (e.g. `.struct.yml`).
 * @returns {string[]} The matching absolute file paths.
 */
function filesWithExtension(directory, extension) {
    return fs
        .readdirSync(directory)
        .filter((name) => name.endsWith(extension))
        .map((name) => path.join(directory, name));
}

/**
 * Check out the given commit in the repository at `repoDir`, failing if the commit does not exist.
 *
 * @param {string} repoDir The repository directory.
 * @param {string} commitHash The commit hash to check out.
 */
function checkoutCommit(repoDir, commitHash) {
    const verify = spawnSync(
        'git',
        ['rev-parse', '--verify', '--quiet', `${commitHash}^{commit}`],
        {cwd: repoDir, stdio: 'ignore'},
    );
    if (verify.status !== 0) {
        console.error(`Error: commit ${commitHash} not found in repository: ${repoDir}`);
        process.exit(1);
    }
    run('git', ['checkout', commitHash], {cwd: repoDir});
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Parse and validate arguments
const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
        'out-dir': {type: 'string', default: path.join(packageRoot, 'src', 'structbuf')},
        'base-class': {type: 'string', default: 'Struct=@threema/protocol/structbuf/base'},
        'external-import': {type: 'string', default: 'types=@threema/protocol/types'},
    },
});
const [structbufTypescriptArg, protocolsDirArg] = positionals;
if (structbufTypescriptArg === undefined || protocolsDirArg === undefined) {
    console.error(
        `Usage: ${process.argv[1]} [options] <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols>`,
    );
    process.exit(1);
}
const commitHash = readPins()['threema-protocols'];
const structbufTypescript = path.resolve(structbufTypescriptArg);
const structbufTypescriptStat = fs.statSync(structbufTypescript, {throwIfNoEntry: false});
if (structbufTypescriptStat === undefined || !structbufTypescriptStat.isFile()) {
    console.error(`Error: structbuf binary not found: ${structbufTypescript}`);
    process.exit(1);
}
const protocolsDir = path.resolve(protocolsDirArg);
const protocolsDirStat = fs.statSync(protocolsDir, {throwIfNoEntry: false});
if (protocolsDirStat === undefined || !protocolsDirStat.isDirectory()) {
    console.error(`Error: protocols directory not found: ${protocolsDir}`);
    process.exit(1);
}

// Check out the requested protocols commit
checkoutCommit(protocolsDir, commitHash);

const structbufOut = path.resolve(values['out-dir']);
fs.mkdirSync(structbufOut, {recursive: true});

// Generate
run(structbufTypescript, [
    ...filesWithExtension(path.join(protocolsDir, 'src'), '.struct.yml'),
    '-o',
    structbufOut,
    '--new-type',
    'true',
    '--byte-length',
    'true',
    '--snapshot',
    'true',
    '--clone',
    'true',
    '--base-class',
    values['base-class'],
    '--external-import',
    values['external-import'],
]);

// Prettify
run(path.join(packageRoot, 'node_modules', '.bin', 'prettier'), [
    '--write',
    path.join(structbufOut, '**/*.ts'),
]);

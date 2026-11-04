#!/usr/bin/env node
// @ts-check

/**
 * Update the generated Threema protocol bindings (protobuf and structbuf) in `src/`.
 */
import {spawnSync} from 'node:child_process';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run a sibling generator script and fail if it does not exit cleanly.
 *
 * @param {string} script The script file name (relative to this directory).
 * @param {readonly string[]} args The arguments to pass.
 */
function runScript(script, args) {
    const result = spawnSync(process.execPath, [path.join(scriptsDir, script), ...args], {
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        console.error(`Error: "${script}" exited with status ${result.status}`);
        process.exit(1);
    }
}

// Parse and validate arguments.
const [structbufTypescript, protocolsDir] = process.argv.slice(2);
if (structbufTypescript === undefined || protocolsDir === undefined) {
    console.error(
        `Usage: ${process.argv[1]} <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols>`,
    );
    process.exit(1);
}

runScript('generate-protobuf.mjs', [path.resolve(protocolsDir)]);
runScript('generate-structbuf.mjs', [
    path.resolve(structbufTypescript),
    path.resolve(protocolsDir),
]);

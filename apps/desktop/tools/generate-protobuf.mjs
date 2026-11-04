#!/usr/bin/env node
// @ts-check

/**
 * Generate protobuf bindings for the local (internal) protobuf modules.
 *
 * Requires the pinned `protoc` version to be installed (see `pins.protoc` in the
 * `@threema/protocol` package).
 *
 * When run with `--postinstall` (e.g. as part of the pnpm `postinstall` hook), a missing or
 * mismatched `protoc` does not lead to an error but only to a warning, so that `pnpm install` works
 * on systems without the pinned `protoc`.
 */
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Run a command and fail if it does not exit cleanly.
 *
 * @param {string} command The executable to run.
 * @param {readonly string[]} args The arguments to pass.
 */
function run(command, args) {
    const result = spawnSync(command, args, {stdio: 'inherit'});
    if (result.status !== 0) {
        console.error(`Error: "${command}" exited with status ${result.status}`);
        process.exit(1);
    }
}

/**
 * Return the absolute paths of all files in `directory` matching `extension`.
 *
 * @param {string} directory The directory to scan.
 * @param {string} extension The file name suffix to match (e.g. `.proto`).
 * @returns {string[]} The matching absolute file paths.
 */
function filesWithExtension(directory, extension) {
    return fs
        .readdirSync(directory)
        .filter((name) => name.endsWith(extension))
        .map((name) => path.join(directory, name));
}

// Parse arguments
const postinstall = process.argv.includes('--postinstall');

/**
 * Abort generation. Under `--postinstall` this is a non-fatal warning (so `pnpm install` succeeds
 * on systems without the pinned `protoc`); otherwise it is a hard error.
 *
 * @param {string} message The reason for aborting.
 * @returns {never} Nothing.
 */
function abort(message) {
    if (postinstall) {
        console.warn(`Warning: ${message}`);
        console.warn('Skipping generation of internal protobuf modules.');
        process.exit(0);
    }
    console.error(`ERROR: ${message}`);
    process.exit(1);
}

// Read the pinned `protoc` version.
const protocolPackageJson = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../packages/protocol/package.json',
);
const expectedProtocVersion = JSON.parse(fs.readFileSync(protocolPackageJson, 'utf8')).pins?.protoc;
if (typeof expectedProtocVersion !== 'string') {
    abort(`Could not read pinned 'protoc' version from ${protocolPackageJson}`);
}

// Ensure protoc is available and matches the pinned version.
const protocVersion = spawnSync('protoc', ['--version'], {encoding: 'utf8'});
if (protocVersion.status !== 0) {
    abort(
        'Protobuf compiler "protoc" not found in your PATH. Please install it manually: https://protobuf.dev/installation/',
    );
}
const installedProtocVersion = protocVersion.stdout.trim().replace(/^libprotoc\s+/u, '');
if (installedProtocVersion !== expectedProtocVersion) {
    abort(
        `Protobuf compiler "protoc" version mismatch: expected libprotoc ${expectedProtocVersion}, ` +
            `found "${protocVersion.stdout.trim()}". Please install protoc ${expectedProtocVersion}: ` +
            'https://protobuf.dev/installation/',
    );
}

// Set the CWD to the project root.
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

// F1Whisper fork: on Windows, pnpm's `.bin` entry without an extension is a POSIX shell script that
// protoc cannot execute ("not a valid Win32 application"); point protoc at the `.cmd` shim instead.
const tsProtoPlugin =
    process.platform === 'win32'
        ? 'protoc-gen-ts_proto=.\\node_modules\\.bin\\protoc-gen-ts_proto.cmd'
        : './node_modules/.bin/protoc-gen-ts_proto';

// Local protobuf modules.
run('protoc', [
    `--plugin=${tsProtoPlugin}`,
    '--ts_proto_out=.',
    '--ts_proto_opt=forceLong=long',
    '--ts_proto_opt=esModuleInterop=true',
    '--ts_proto_opt=oneof=unions',
    '--ts_proto_opt=outputJsonMethods=false',
    '--ts_proto_opt=outputPartialMethods=false',
    '--ts_proto_opt=constEnums=true',
    '--ts_proto_opt=outputClientImpl=false',
    '--ts_proto_opt=outputServices=false',
    '--ts_proto_opt=env=browser',
    '--ts_proto_opt=exportCommonSymbols=false',
    '--ts_proto_opt=enumsAsLiterals=true',
    ...filesWithExtension('src/common/internal-protobuf', '.proto'),
]);

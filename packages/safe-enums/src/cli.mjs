#!/usr/bin/env node
// @ts-check

/**
 * Generate safe enum wrappers from a schema.
 *
 * Usage: safe-enums <schema-path> [<output-path>]
 *
 * The generated module is formatted with Prettier (using the configuration that applies to the
 * output path) and then written to the output path. If no output path is given, it is printed to
 * standard output instead.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parseArgs} from 'node:util';

import {renderSafeEnums} from './render.mjs';

const USAGE = `Usage: safe-enums <schema> [<output>]

Generate safe enum wrappers from a schema.

The generated module is formatted with Prettier (using the configuration that applies to the
output path) and then written to the output path. If no output path is given, it is printed to
standard output instead.`;

/**
 * Write `content` to `filepath` by writing to a temporary file and moving it into place, so that a
 * failed write cannot leave a partially written file behind.
 *
 * @param {string} filepath The path to write to.
 * @param {string} content The content to write.
 * @throws {Error} if the temporary file could not be written or moved into place.
 */
function writeAtomically(filepath, content) {
    const temporary = `${filepath}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(temporary, content, 'utf8');
        fs.renameSync(temporary, filepath);
    } catch (error) {
        fs.rmSync(temporary, {force: true});
        throw error;
    }
}

let args;
try {
    args = parseArgs({
        allowPositionals: true,
        options: {help: {type: 'boolean', short: 'h'}},
    });
} catch (error) {
    // Note: The message names the offending argument, which is the useful part of the error, so it
    // is kept while the stack trace is dropped.
    console.error(`Error: ${error instanceof Error ? error.message : error}\n\n${USAGE}`);
    process.exit(1);
}

const {positionals, values} = args;
if (values.help === true) {
    console.log(USAGE);
    process.exit(0);
}
const [schemaPathArg, outputPathArg] = positionals;
if (schemaPathArg === undefined || positionals.length > 2) {
    console.error(USAGE);
    process.exit(1);
}
const schemaPath = path.resolve(schemaPathArg);
const outputPath = outputPathArg === undefined ? undefined : path.resolve(outputPathArg);

let output;
try {
    // Note: Generation happens fully in memory, so that a malformed schema leaves the previous
    // generated module untouched.
    output = await renderSafeEnums(
        fs.readFileSync(schemaPath, 'utf8'),
        schemaPathArg,
        outputPath ?? schemaPath,
    );
} catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
}

if (outputPath === undefined) {
    process.stdout.write(output);
} else {
    writeAtomically(outputPath, output);
}

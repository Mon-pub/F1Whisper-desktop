// @ts-check

/**
 * Read the protocol tooling pins from this package's `package.json`.
 *
 * These pins are the single source of truth for reproducible protocol generation. They are consumed
 * by the generator scripts, the devcontainer setup and the CI drift checks.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 *  See {@link ../package.json}.
 *
 * @typedef {{ protoc: string; "structbuf-typescript": string; "threema-protocols": string; }} Pins
 */

/**
 * Read and validate the `pins` from `package.json`.
 *
 * The returned object maps each pin name (`protoc`, `structbuf-typescript`, `threema-protocols`) to
 * its pinned value.
 *
 * @returns {Pins} The validated pins.
 */
export function readPins() {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const pins = pkg.pins;
    for (const key of ['protoc', 'structbuf-typescript', 'threema-protocols']) {
        if (typeof pins?.[key] !== 'string' || pins[key] === '') {
            console.error(`Error: 'pins.${key}' missing or empty in package.json`);
            process.exit(1);
        }
    }
    return pins;
}

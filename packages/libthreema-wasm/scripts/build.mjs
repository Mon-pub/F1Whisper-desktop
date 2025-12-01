// Build `libthreema` (WASM) from the included sources.

import childProcess from 'node:child_process';
import path from 'node:path';

// Determine path of the package's root directory (i.e., an absolute path ending in
// `packages/libthreema-wasm`).
const rootDir = path.resolve(import.meta.dirname, '..');

try {
    childProcess.execFileSync('bash', ['./tools/build-wasm.sh', '--target=web', '--no-container'], {
        cwd: path.join(rootDir, 'libs', 'libthreema'),
        encoding: 'utf-8',
        stdio: 'inherit',
    });
} catch (/** @type {any} */ error) {
    console.error(`\nERROR: Failed to build libthreema:\n${error}`);
    process.exit(1);
}

import {execSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

// Determine path of the package's root directory (i.e., an absolute path ending in
// `packages/libthreema-wasm`).
const rootDir = path.resolve(import.meta.dirname, '..');
// Determine the containers dir under the desktop-client folder.
const containersDir = path.resolve(import.meta.dirname, '..', '..', '..', 'containers');

function printUsage() {
    const [node, script] = process.argv;

    console.log(`Usage: ${node} ${script} <path-to-libthreema-repository> <commit-hash>`);
}

// Parse arguments.
const {positionals} = parseArgs({
    allowPositionals: true,
});
if (positionals[0] === undefined || positionals[1] === undefined) {
    printUsage();
    process.exit(1);
}

const libthreemaDir = path.resolve(positionals[0]);
const commitHash = positionals[1];

console.log(`Copying libthreema from ${libthreemaDir}`);

// Move to libthreema source for git operations.
process.chdir(libthreemaDir);

// Check that the repo is clean.
const status = execSync('git status --porcelain', {encoding: 'utf8'});
if (status.trim() !== '') {
    console.error('Source repository has changes, please commit them');
    process.exit(1);
}

// Checkout the given commit.
execSync('git fetch', {stdio: 'inherit'});
execSync(`git checkout ${commitHash}`, {stdio: 'inherit'});

// Ensure that the required submodule is checked out.
const submoduleStatus = execSync('git submodule status threema-protocols', {encoding: 'utf8'});
if (submoduleStatus.startsWith('-')) {
    console.error('Submodule "threema-protocols" in libthreema repository is not initialized');
    console.error(
        `Please run 'git submodule update --init' in the libthreema directory at ${libthreemaDir}.`,
    );
    process.exit(1);
}

// Move to libthreema folder in project.
const targetDir = path.join(rootDir, 'libs', 'libthreema');
process.chdir(targetDir);

// Remove all files in libthreema folder.
execSync('find . -mindepth 1 -maxdepth 1 -exec rm -rf {} +');

// Copy files from libthreema source repository.
execSync(`rsync -a "${libthreemaDir}/" .`, {stdio: 'inherit'});

// Extract Dockerfile before cleaning up.
execSync(`cp ".devcontainer/Dockerfile" ${containersDir}/libthreema/`);

// Run libthreema cleanup script.
execSync('./.prepare-submodule-publish.sh --yes', {stdio: 'inherit'});

// Add required wasm target to rust toolchain file.
appendFileSync('rust-toolchain.toml', 'targets = ["wasm32-unknown-unknown"]\n');

console.log(`Successfully updated libthreema to commit ${commitHash}`);

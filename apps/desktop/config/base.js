// @ts-check

// Constants in this file are used in both build scripts and the main app code, so we use a plain JS
// file (with JSDoc type annotations) here, so that it can be imported by both TypeScript and plain
// JS code.
//
// Note: Don't use imports in this file.

/**
 * Allowed build architectures. Needs to be a subset of NodeJS' process architecture names.
 */
export const BUILD_ARCHITECTURES = /** @type {const} */ (['arm64', 'x64']);

/**
 *  See {@link BUILD_ARCHITECTURES}.
 *
 * @typedef {typeof BUILD_ARCHITECTURES[number]} BuildArch
 */

export const BUILD_ENTRIES = /** @type {const} */ ([
    'app',
    'cli',
    'electron-main',
    'electron-preload',
    'screenshare-preload',
    'karma-tests',
    'mocha-tests',
]);

/**
 *  See {@link BUILD_ENTRIES}.
 *
 * @typedef {typeof BUILD_ENTRIES[number]} BuildEntry
 */

/**
 * Build environments:
 * - sandbox: Connect to sandbox servers (only accessible from Threema-internal networks).
 * - live: Connect to live servers.
 * - onprem: Connect to on-premises servers defined in the OPPF configuration file.
 */
export const BUILD_ENVIRONMENTS = /** @type {const} */ (['sandbox', 'live', 'onprem']);

/**
 * See {@link BUILD_ENVIRONMENTS}.
 *
 * @typedef {typeof BUILD_ENVIRONMENTS[number]} BuildEnvironment
 */

/**
 * Build flavors.
 *
 * @satisfies {`${BuildVariant}-${BuildEnvironment}`[]} Valid combinations of build variant and
 * build environment.
 */
export const BUILD_FLAVORS = /** @type {const} */ ([
    'consumer-sandbox',
    'consumer-live',
    'work-sandbox',
    'work-live',
    'work-onprem',
    'custom-onprem',
]);

/**
 * See {@link BUILD_FLAVORS}.
 *
 * @typedef {typeof BUILD_FLAVORS[number]} BuildFlavor
 */

/**
 * Build modes:
 * - development: Used while developing
 * - production: Used for all release artifacts (including internal releases)
 * - testing: Same as production but different Electron fuses. Uses for playwright e2e testing
 */
export const BUILD_MODES = /** @type {const} */ (['development', 'production', 'testing']);

/**
 *  See {@link BUILD_MODES}.
 *
 * @typedef {typeof BUILD_MODES[number]} BuildMode
 */

/**
 * Allowed build platforms. Needs to be a subset of NodeJS' process platform names.
 */
export const BUILD_PLATFORMS = /** @type {const} */ (['darwin', 'linux', 'win32']);

/**
 *  See {@link BUILD_PLATFORMS}.
 *
 * @typedef {typeof BUILD_PLATFORMS[number]} BuildPlatform
 */

/**
 * Build targets:
 * - cli: Builds the CLI
 * - electron: Builds the Electron-wrapped app
 */
export const BUILD_TARGETS = /** @type {const} */ (['cli', 'electron']);

/**
 *  See {@link BUILD_TARGETS}.
 *
 * @typedef {typeof BUILD_TARGETS[number]} BuildTarget
 */

/**
 * Build variants:
 * - consumer: The regular Threema application for private end users
 * - work: Application for Threema Work customers
 */
export const BUILD_VARIANTS = /** @type {const} */ (['consumer', 'work', 'custom']);

/**
 * See {@link BUILD_VARIANTS}.
 *
 * @typedef {typeof BUILD_VARIANTS[number]} BuildVariant
 */

/**
 * Determine the app identifier (used e.g. in filenames).
 *
 * @param {BuildFlavor} flavor Build flavor.
 * @param {string} baseAppName Name to use as the base for generating the app identifier, e.g.
 *   "Threema".
 */
export function determineAppIdentifier(flavor, baseAppName) {
    const name = slugify(baseAppName.toLowerCase());
    switch (flavor) {
        case 'consumer-live':
            return `${name}-desktop`;
        case 'consumer-sandbox':
            return `${name}-green-desktop`;
        case 'work-live':
            return `${name}-work-desktop`;
        case 'work-sandbox':
            return `${name}-blue-desktop`;
        case 'work-onprem':
            return `${name}-onprem-desktop`;
        case 'custom-onprem':
            return `${name}-desktop`;
        default:
            return unreachable(flavor);
    }
}

/**
 * Determine the app name used for packaging.
 *
 * Note: Keep this in sync with `determine_app_name` in `common` rust crate.
 *
 * @param {BuildFlavor} flavor Build flavor to determine the app name for.
 * @param {string} baseAppName Name to use as the base for generating the flavored app name, e.g.
 *   "Threema".
 * @returns {string} Pretty app name for the given `flavor`.
 */
export function determineAppName(flavor, baseAppName) {
    let name = baseAppName;
    switch (flavor) {
        case 'consumer-live':
            break;
        case 'consumer-sandbox':
            name += ' Green';
            break;
        case 'work-live':
            name += ' Work';
            break;
        case 'work-sandbox':
            name += ' Blue';
            break;
        case 'work-onprem':
            name += ' OnPrem';
            break;
        case 'custom-onprem':
            // The full app name of custom builds is determined by their config.
            break;
        default:
            unreachable(flavor);
    }
    name += ' Beta';
    return name;
}

/**
 * Canonicalize the basename of a packaged application output directory to its on-disk form.
 *
 * `@electron/packager` emits an output directory named `<app name>-<platform>-<arch>`, where the app
 * name may contain spaces (e.g. "F1Whisper Beta"). Spaces in the path hurt shell/scripting
 * ergonomics, so the packaged directory is stored with spaces collapsed to hyphens. This is the
 * single transform every stage (the packager that produces the directory, and the installer/Flatpak
 * packaging that must locate it) has to agree on.
 *
 * @param {string} dirName Raw packaged output directory basename, possibly containing spaces.
 * @returns {string} The canonical, space-free directory basename.
 */
export function canonicalizePackagedDirName(dirName) {
    return dirName.replaceAll(' ', '-');
}

/**
 * Determine the canonical (space-free) basename of the packaged application output directory for a
 * given flavor, platform and architecture.
 *
 * Single source of truth shared by the packager (which produces the directory) and the
 * installer/Flatpak packaging (which must locate it), so a produced directory is always found by a
 * later build stage. Kept consistent with the directory `@electron/packager` emits
 * (`<app name>-<platform>-<arch>`) via {@link canonicalizePackagedDirName}.
 *
 * @param {BuildFlavor} flavor Build flavor.
 * @param {string} baseAppName Base app name, e.g. "Threema".
 * @param {string} platform Node platform string as used by the packager (e.g. "linux").
 * @param {string} arch Node arch string as used by the packager (e.g. "x64").
 * @returns {string} Canonical packaged output directory basename, e.g. "F1Whisper-Beta-linux-x64".
 */
export function determinePackagedDirName(flavor, baseAppName, platform, arch) {
    return canonicalizePackagedDirName(
        `${determineAppName(flavor, baseAppName)}-${platform}-${arch}`,
    );
}

/**
 * Determine the canonical fork release version string, e.g. "2.0-beta61-f1.3".
 *
 * Single source of truth for the fork identity: shown in About/diagnostics and matched by the
 * release tag gate (`v${version}-f1.${f1Release}`).
 *
 * @param {string} version Upstream base version, e.g. "2.0-beta61".
 * @param {number} f1Release Fork release counter for this upstream version.
 * @returns {string} Canonical fork version string.
 */
export function determineForkVersion(version, f1Release) {
    return `${version}-f1.${f1Release}`;
}

/**
 * Stride reserving the low digits of a fork version code for the fork release counter. `f1Release`
 * must stay below this value.
 */
export const FORK_RELEASE_CODE_STRIDE = 1000;

/**
 * Determine a monotonic update/installer version code that strictly increases across fork releases
 * of the same upstream version (and across upstream version-code bumps). Combines the upstream
 * `versionCode` with the fork `f1Release` so update selection can order same-upstream fork releases.
 * Kept independent of the segment-limited MSIX version (see {@link determineMsixVersion}).
 *
 * @param {number} versionCode Upstream version code.
 * @param {number} f1Release Fork release counter (must be < {@link FORK_RELEASE_CODE_STRIDE}).
 * @returns {number} Monotonic fork version code.
 */
export function determineForkVersionCode(versionCode, f1Release) {
    return versionCode * FORK_RELEASE_CODE_STRIDE + f1Release;
}

/**
 * Determine the 4-part MSIX/AppX version "Major.Minor.Build.Revision" from the fork identity, placing
 * the fork release counter in the Revision segment so installers upgrade monotonically across fork
 * releases of the same upstream version. Each segment stays within the AppX 0-65535 limit (unlike the
 * combined {@link determineForkVersionCode}).
 *
 * @param {string} version Upstream base version, e.g. "2.0-beta61".
 * @param {number} versionCode Upstream version code (Build segment).
 * @param {number} f1Release Fork release counter (Revision segment).
 * @returns {string} MSIX version string, e.g. "2.0.63.3".
 */
export function determineMsixVersion(version, versionCode, f1Release) {
    const majorMinor = version.replace(/^(?<majorMinor>[0-9]*\.[0-9]*).*/u, '$<majorMinor>');
    return `${majorMinor}.${versionCode}.${f1Release}`;
}

/**
 * Determine the versions passed to Electron Packager. The canonical fork string is exposed as the
 * human-readable app/product version and written into the deployed package.json. Windows also needs
 * a strictly numeric four-part file/build version.
 *
 * @param {string} version Upstream base version.
 * @param {number} versionCode Upstream numeric version code.
 * @param {number} f1Release Fork release counter.
 * @returns {{appVersion: string, windowsBuildVersion: string}} Packager version metadata.
 */
export function determinePackagerVersions(version, versionCode, f1Release) {
    return {
        appVersion: determineForkVersion(version, f1Release),
        windowsBuildVersion: determineMsixVersion(version, versionCode, f1Release),
    };
}

/**
 * Determine the name of the mobile app corresponding to this build flavor.
 *
 * @param {BuildFlavor} flavor Build flavor to determine the mobile app name for.
 * @param {string} baseAppName Name to use as the base for generating the flavored mobile app name,
 *   e.g. "Threema".
 * @returns {string} Pretty mobile app name for the given `flavor`.
 */
export function determineMobileAppName(flavor, baseAppName) {
    let name = baseAppName;
    switch (flavor) {
        case 'consumer-live':
            break;
        case 'consumer-sandbox':
            name += ' Green';
            break;
        case 'work-live':
            name += ' Work';
            break;
        case 'work-sandbox':
            name += ' Blue';
            break;
        case 'work-onprem':
            name += ' OnPrem';
            break;
        case 'custom-onprem':
            break;
        default:
            unreachable(flavor);
    }
    return name;
}

/**
 * Determine the app reverse domain notation used as application ID.
 *
 * Note: Keep this in sync with `determine_app_rdn` in `common` rust crate.
 *
 * @param {BuildFlavor} flavor Build flavor to determine the app's reverse domain name name for.
 * @param {string} baseAppName Name to use as the base for generating the flavored RDN, e.g.
 *   "Threema".
 * @returns {string} Reverse domain name for the given `flavor`.
 */
export function determineAppRdn(flavor, baseAppName) {
    const name = slugify(baseAppName.toLowerCase());
    switch (flavor) {
        case 'consumer-live':
            return `ch.${name}.${name}-desktop`;
        case 'consumer-sandbox':
            return `ch.${name}.${name}-green-desktop`;
        case 'work-live':
            return `ch.${name}.${name}-work-desktop`;
        case 'work-sandbox':
            return `ch.${name}.${name}-blue-desktop`;
        case 'work-onprem':
            return `ch.${name}.${name}-onprem-desktop`;
        case 'custom-onprem':
            return `ch.${name}.${name}-desktop`;
        default:
            return unreachable(flavor);
    }
}

/**
 * Determine the output binary name of the built app (including the appropriate extension depending
 * on the OS, e.g., `.exe`).
 *
 * @param {BuildFlavor} flavor The flavor to get the appropriate binary name for.
 * @param {BuildPlatform} platform The platform to get the appropriate binary name for.
 * @param {string} baseAppName Name to use as the base for generating the flavored binary name, e.g.
 *   "Threema".
 * @returns {string} App binary name for the given `flavor` and `platform`.
 */
export function determineBinaryName(flavor, platform, baseAppName) {
    switch (platform) {
        case 'darwin':
            return `${determineAppName(flavor, baseAppName)}.app`;
        case 'win32':
            return 'F1WhisperDesktop.exe';
        default:
            return 'F1WhisperDesktop';
    }
}

/**
 * Determine the output name of an extra binary (including the appropriate extension depending on
 * the OS, e.g., `.exe`).
 *
 * @param {BuildPlatform} platform The platform to get the appropriate extra binary name for.
 * @param {string} name The desired binary name without the extension.
 * @returns {string} App extra binary name for the given `platform`.
 */
export function determineExtraBinaryName(platform, name) {
    switch (platform) {
        case 'win32':
            return `${name}.exe`;
        default:
            return name;
    }
}

/**
 * Determine the file name the app installer is distributed as (including the appropriate extension
 * depending on the OS, e.g., `.msix`).
 *
 * @param {ReturnType<typeof determineAppIdentifier>} appId The identifier of the contained app in
 *   this installer.
 * @param {BuildArch} arch The CPU architecture this installer is intended for.
 * @param {Exclude<BuildPlatform, "linux">} platform The OS this installer is intended for.
 * @param {string} version The app version name.
 * @returns {string} Installer name for the given parameters.
 */
export function determineInstallerName(appId, arch, platform, version) {
    switch (platform) {
        case 'darwin':
            return `${appId}-v${version}-macos-${arch}.dmg`;

        case 'win32':
            return `${appId}-v${version}-windows-${arch}.msix`;

        default:
            return unreachable(platform);
    }
}

/**
 * Determine the name of the mobile app corresponding to this build flavor.
 *
 * @param {BuildFlavor} flavor Build flavor to determine the mobile app name for.
 * @param {string} baseAppName Name to use as the base for generating the app id, e.g. "Threema".
 * @returns {string} Pretty mobile app name for the given `flavor`.
 */
export function determineMsixApplicationId(flavor, baseAppName) {
    let applicationId;
    const slugifiedName = slugify(baseAppName);
    switch (flavor) {
        case 'consumer-live':
            applicationId = `${slugifiedName}.Desktop.Consumer`;
            break;
        case 'consumer-sandbox':
            applicationId = `${slugifiedName}.Desktop.Green`;
            break;
        case 'work-live':
            applicationId = `${slugifiedName}.Desktop.Work`;
            break;
        case 'work-sandbox':
            applicationId = `${slugifiedName}.Desktop.Blue`;
            break;
        case 'work-onprem':
            applicationId = `${slugifiedName}.Desktop.OnPrem`;
            break;
        case 'custom-onprem':
            applicationId = slugifiedName;
            break;
        default:
            unreachable(flavor);
    }
    return applicationId;
}

/**
 * Return whether or not the specified string is a valid {@link BuildFlavor}.
 *
 * @param {string} flavor The value to check.
 * @returns {flavor is BuildFlavor} Whether the given `flavor` is a valid `BuildFlavor`.
 */
export function isBuildFlavor(flavor) {
    // @ts-expect-error TypeScript will highlight an error here, because `string` is not assignable
    // to `BuildFlavor`. However, it *might* be, which is the reason why this guard function exists
    // at all.
    return BUILD_FLAVORS.includes(flavor);
}

/**
 * Return whether or not the specified string is a valid {@link BuildPlatform}.
 *
 * @param {string} platform The value to check.
 * @returns {platform is BuildPlatform} Whether the given `platform` is a valid `BuildPlatform`.
 */
export function isBuildPlatform(platform) {
    // @ts-expect-error TypeScript will highlight an error here, because `string` is not assignable
    // to `BuildPlatform`. However, it *might* be, which is the reason why this guard function
    // exists at all.
    return BUILD_PLATFORMS.includes(platform);
}

/**
 * Bring name into a suitable format, i.e so that it can be used in the file system, in
 * `appManifests` and in `plists`
 *
 * @param {string} name The string to be slugified.
 * @returns {string} a version of the string that only contains `[a-zA-Z0-9]`.
 */
export function slugify(name) {
    return name.replaceAll(/[^a-zA-Z0-9]/gu, '');
}

/**
 * Duplicate of the function in `assert.ts`, because this is not a module. Asserts that code section
 * is unreachable.
 *
 * @param {never} value The value to assert.
 * @param {(string|Error)=} messageOrError Error or message to throw.
 * @returns {never} Never returns.
 * @throws Always throws.
 */
function unreachable(value, messageOrError) {
    throw messageOrError instanceof Error
        ? messageOrError
        : new Error(messageOrError ?? 'Unreachable code section!');
}

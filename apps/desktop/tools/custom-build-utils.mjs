import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'process';

/**
 * Generate the icons necessary to build the app.
 *
 * @param {string} baseConfigPath The path to the config.
 * @param {unknown} config The parsed config for custom builds.
 */
export function generateAppIcons(baseConfigPath, config) {
    const {console} = globalThis;

    const appDir = path.resolve(import.meta.dirname, '..');
    const monorepoRootDir = path.resolve(appDir, '..', '..');

    console.log('Generating icons for web');
    childProcess.execSync(
        `pnpm run generate:desktop:icons:web:custom -- "${path.join(baseConfigPath, config.assetPaths.web)}"`,
        {cwd: monorepoRootDir, stdio: 'inherit', env: {...process.env}},
    );

    console.log('Generating icons for macOS');
    childProcess.execSync(
        `pnpm run generate:desktop:icons:macos:custom -- "${path.join(baseConfigPath, config.assetPaths.macos.icon)}"`,
        {cwd: monorepoRootDir, stdio: 'inherit', env: {...process.env}},
    );

    console.log('Moving installer background image');
    const installerOutPath = 'packaging/assets/installers';
    if (!fs.existsSync(installerOutPath)) {
        childProcess.execSync(`mkdir -p ${installerOutPath}`);
    }
    childProcess.execSync(
        `cp "${path.join(baseConfigPath, config.assetPaths.macos.installer)}" ${installerOutPath}/custom.png`,
    );
    childProcess.execSync(
        `cp "${path.join(baseConfigPath, config.assetPaths.macos['installer@2x'])}" ${installerOutPath}/custom@2x.png`,
    );

    console.log('Generating icons for Windows');
    childProcess.execSync(
        `pnpm run generate:desktop:icons:windows:custom -- "${path.join(baseConfigPath, config.assetPaths.windows.standard)}" "${path.join(baseConfigPath, config.assetPaths.windows.store ?? config.assetPaths.windows.standard)}"`,
        {cwd: monorepoRootDir, stdio: 'inherit', env: {...process.env}},
    );
}

import fs from 'node:fs';
import path from 'node:path';

import * as v from '@badrap/valita';
import * as ASAR from '@electron/asar';
import {_electron as electron, type ElectronApplication} from 'playwright';

import {getPersistentAppDataBaseDir} from '~/electron/electron-utils';
import type {ElectronAppInfo} from '~/test/playwright/common/types/electron-app-info';
import {colorScheme} from '~/test/playwright/config';

import {
    determineAppName,
    isBuildFlavor,
    type BuildFlavor,
    type BuildVariant,
} from '../../../../../config/base';
import {mockOppfServer} from '../../mocks/onprem-provisioning-server/client';
import {
    createOppfString,
    getMockDomainsRuleForSpki,
} from '../../mocks/onprem-provisioning-server/oppf-data';
import {loadTrustedTestKeypair} from '../../mocks/onprem-provisioning-server/signing';
import {
    MOCK_SERVER_PORT,
    OPPF_PATH,
    type OppfVariant,
} from '../../mocks/onprem-provisioning-server/types';

export function getBuildFlavor(): BuildFlavor {
    if (process.env.TURBO_BUILD_VARIANT === undefined) {
        throw new Error(
            `Env variable 'TURBO_BUILD_VARIANT' is missing, please set it before running playwright tests.`,
        );
    }
    if (process.env.TURBO_BUILD_ENVIRONMENT === undefined) {
        throw new Error(
            `Env variable 'TURBO_BUILD_ENVIRONMENT' is missing, please set it before running playwright tests.`,
        );
    }

    const PLAYWRIGHT_FLAVOR = `${process.env.TURBO_BUILD_VARIANT}-${process.env.TURBO_BUILD_ENVIRONMENT}`;
    if (!isBuildFlavor(PLAYWRIGHT_FLAVOR)) {
        throw new Error(
            `Build flavor '${PLAYWRIGHT_FLAVOR}' is not supported, please export a valid values in the 'TURBO_BUILD_ENVIRONMENT' and 'TURBO_BUILD_VARIANT' env vars.`,
        );
    }

    return PLAYWRIGHT_FLAVOR;
}

export function getBuildVariant(flavor: BuildFlavor): BuildVariant {
    return flavor.split('-')[0] as BuildVariant;
}

export function determineScreenshotSuffix(variant: string): string[] | undefined {
    return process.env.PLAYWRIGHT_SCREENSHOTS !== undefined ? ['marketing', variant] : undefined;
}

function getTestProfile(): string {
    if (process.env.PLAYWRIGHT_PROFILE === undefined) {
        throw new Error(
            `Env variable 'PLAYWRIGHT_PROFILE' is missing, please set it before running playwright tests.`,
        );
    }
    return process.env.PLAYWRIGHT_PROFILE;
}

function getTestDataFile(flavor: BuildFlavor, user?: string): string {
    const fileName =
        user !== undefined ? `test-data-${flavor}-${user}.json` : `test-data-${flavor}.json`;
    const filePath = path.resolve(path.join('src', 'test', 'playwright', fileName));

    const localOverride =
        user !== undefined
            ? `test-data-${flavor}-${user}.local.json`
            : `test-data-${flavor}.local.json`;
    const localOverridePath = path.resolve(path.join('src', 'test', 'playwright', localOverride));

    return fs.existsSync(localOverridePath) ? localOverridePath : filePath;
}

function deleteProfileDirectory(flavor: BuildFlavor, profile: string): void {
    const profileDirectory = path.join(...getPersistentAppDataBaseDir(), `${flavor}-${profile}`);
    fs.rmSync(profileDirectory, {recursive: true, force: true});
}

/**
 * Determine information about electron app to be tested.
 *
 * Note: The app is being looked up in the distribution build directory based on the build flavor.
 * It must be built before calling this function.
 */
function getElectronAppInfo(flavor: BuildFlavor): ElectronAppInfo {
    const appName = determineAppName(flavor, 'Threema');

    const buildDir = path.join(
        '..',
        '..',
        'build',
        'apps',
        'desktop',
        'packaged',
        `${appName}-${process.platform}-${process.arch}`,
    );

    let resourcesDir: string;
    let executablePath: string;

    if (process.platform === 'darwin') {
        const bundleDir = path.join(buildDir, `${appName}.app`);
        resourcesDir = path.join(bundleDir, 'Contents', 'Resources');
        executablePath = path.join(bundleDir, 'Contents', 'MacOS', 'ThreemaDesktop');
    } else {
        const binary = process.platform === 'win32' ? 'ThreemaDesktop.exe' : 'ThreemaDesktop';
        resourcesDir = path.join(buildDir, 'resources');
        executablePath = path.join(buildDir, binary);
    }

    return {electronMain: getElectronMain(resourcesDir), executablePath};
}

/**
 * Minimal package.json schema, extracting some components we need.
 */
export const PACKAGE_JSON_SCHEMA = v
    .object({main: v.string(), version: v.string()})
    .rest(v.unknown());

function getElectronMain(resourcesDir: string): string {
    // Extract package.json from ASAR file
    const asarPath = path.join(resourcesDir, 'app.asar');
    const packageJsonString = ASAR.extractFile(asarPath, 'package.json').toString('utf8');
    const packageJson = PACKAGE_JSON_SCHEMA.parse(JSON.parse(packageJsonString));

    // Return "main" path
    return path.join(asarPath, packageJson.main);
}

export async function launchElectronApp(
    options: {
        onPremUser?: string;
        oppfVariant?: OppfVariant;
    } = {},
): Promise<ElectronApplication> {
    const flavor = getBuildFlavor();
    const profile = getTestProfile();
    let testDataFile = getTestDataFile(flavor, options.onPremUser);
    const electronAppInfo = getElectronAppInfo(flavor);
    deleteProfileDirectory(flavor, profile);
    if (process.env.TURBO_BUILD_ENVIRONMENT === 'onprem') {
        const testDataFileContents = JSON.parse(
            fs.readFileSync(testDataFile, {encoding: 'utf-8'}),
        ) as {
            [key: string]: unknown;
            workData: {username: string; password: string};
        };
        await mockOppfServer.setRegularOppf({
            variant: options.oppfVariant,
            statusCode: 200,
            username: testDataFileContents.workData.username,
            password: testDataFileContents.workData.password,
        });

        // Synthesize the cached OPPF (signed with the same trusted keypair the mock server uses)
        // and inject it into a temp copy of the test-data file. The Electron test backend reads
        // this from `oppFile` to pre-seed `oppfCachedConfig` in key storage, simulating a device
        // that has already been linked.
        testDataFileContents.oppFile = createOppfString({
            domainsRules: [
                getMockDomainsRuleForSpki('e60wJY6o1gwm840F/uvEHL3XXnJzfclhLdefcDkm45U='),
            ],
            keypair: loadTrustedTestKeypair(),
            licenseExpiry: '2027-02-01',
        });
        testDataFileContents.oppfUrl = `https://127.0.0.1:${MOCK_SERVER_PORT}${OPPF_PATH}`;
        const userSuffix = options.onPremUser !== undefined ? `-${options.onPremUser}` : '';
        const tempTestDataDir = path.resolve(path.join('.temp', 'playwright'));
        const tempTestDataFile = path.join(
            tempTestDataDir,
            `test-data-${flavor}${userSuffix}.json`,
        );
        fs.mkdirSync(tempTestDataDir, {recursive: true});
        fs.writeFileSync(tempTestDataFile, JSON.stringify(testDataFileContents));
        testDataFile = tempTestDataFile;
    }
    return await electron.launch({
        args: [
            electronAppInfo.electronMain,
            `--threema-profile=${profile}`,
            process.env.GITLAB_CI === 'true' && flavor === 'consumer-sandbox'
                ? ''
                : `--threema-test-data=${testDataFile}`,
        ],
        executablePath: electronAppInfo.executablePath,
        colorScheme,
    });
}

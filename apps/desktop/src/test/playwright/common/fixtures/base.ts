import fs from 'node:fs';
import path from 'node:path';

import {test as base} from '@playwright/test';

import type {ElectronFixture} from '~/test/playwright/common/types/electron-fixture';
import {
    determineScreenshotSuffix,
    getBuildVariant,
    getBuildFlavor,
    PACKAGE_JSON_SCHEMA,
    launchElectronApp,
} from '~/test/playwright/common/utils/electron-utils';

import {determineAppName} from '../../../../../config/base';

export const test = base.extend<ElectronFixture>({
    electronApp: async ({}, use) => {
        const electronApp = await launchElectronApp();

        await use(electronApp);
    },
    screenshotPath: async ({}, use) => {
        const flavor = getBuildFlavor();
        const appName = determineAppName(flavor, 'Threema');
        const suffix = determineScreenshotSuffix(getBuildVariant(flavor));
        const screenshotPath = path.join(
            'build',
            'playwright',
            'screenshots',
            ...(suffix ?? [`${appName}-${process.platform}-${process.arch}`]),
        );

        await use(screenshotPath);
    },

    buildVariant: async ({}, use) => {
        const flavor = getBuildFlavor();
        const variant = getBuildVariant(flavor);
        await use(variant);
    },

    currentVersion: async ({}, use) => {
        const packageJsonString = fs.readFileSync('package.json', {encoding: 'utf-8'});
        const version = PACKAGE_JSON_SCHEMA.parse(JSON.parse(packageJsonString)).version;
        await use(version);
    },
});

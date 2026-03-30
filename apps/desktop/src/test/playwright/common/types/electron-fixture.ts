import type {ElectronApplication} from '@playwright/test';

import type {DomainCertificatePin} from '~/common/types';

import type {BuildVariant} from '../../../../../config/base';

export interface ElectronFixture {
    readonly electronApp: ElectronApplication;
    readonly screenshotPath: string;
    readonly buildVariant: BuildVariant;
    readonly currentVersion: string;
}

export interface PlaywrightIpcService {
    readonly updatePublicKeyPins: (publicKeyPins: DomainCertificatePin[]) => Promise<boolean>;
}

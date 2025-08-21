import type {ClientInfo, WorkContext} from 'libthreema';

import type {ServicesForBackend} from '~/common/backend';
import type {ThreemaWorkData} from '~/common/device';
import {getBrowserInfo} from '~/common/dom/utils/browser';
import {assert} from '~/common/utils/assert';

/**
 * Create a {@link ClientInfo} object used by libthreema.
 */
export function getClientInfo(services: Pick<ServicesForBackend, 'systemInfo'>): ClientInfo {
    const {arch, os, locale} = services.systemInfo;
    const {name, version} = getBrowserInfo(self.navigator.userAgent);
    return {
        platform: 'desktop',
        version: import.meta.env.BUILD_VERSION,
        locale,
        rendererName: name,
        rendererVersion: version?.toString() ?? '0.0.0',
        osName: os,
        osArchitecture: arch,
    };
}

/**
 * Create a {@link WorkContext} object used by libthreema.
 *
 * @throws If called in a consumer build.
 */
export function createWorkContext(workData: ThreemaWorkData): WorkContext {
    assert(
        import.meta.env.BUILD_VARIANT !== 'consumer',
        'Work context cannot be created in consumer build',
    );
    if (import.meta.env.BUILD_ENVIRONMENT === 'onprem') {
        return {credentials: {...workData.workCredentials}, flavor: 'on-prem'};
    }

    if (import.meta.env.BUILD_VARIANT === 'custom') {
        return {credentials: {...workData.workCredentials}, flavor: 'on-prem'};
    }

    return {credentials: {...workData.workCredentials}, flavor: 'work'};
}

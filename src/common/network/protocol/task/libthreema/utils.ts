import type {ClientInfo} from 'libthreema';

import type {ServicesForBackend} from '~/common/backend';
import {getBrowserInfo} from '~/common/dom/utils/browser';

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

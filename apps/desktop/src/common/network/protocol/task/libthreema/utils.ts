import type {ClientInfo, HttpsRequest, HttpsResult, WorkContext} from '@threema/libthreema-wasm';

import type {ServicesForBackend} from '~/common/backend';
import type {ThreemaWorkData} from '~/common/device';
import {getBrowserInfo} from '~/common/dom/utils/browser';
import type {Logger} from '~/common/logging';
import type {ServicesForModel} from '~/common/model';
import {assert, ensureError} from '~/common/utils/assert';

/**
 * Create a {@link ClientInfo} object used by libthreema.
 */
export function getClientInfo(
    services: Pick<ServicesForBackend | ServicesForModel, 'systemInfo'>,
): ClientInfo {
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

/**
 * Make a request instructed by libtreema and return a {@link HttpsResult} object.
 */
export async function doRequest(
    {url, method, headers, body, timeoutMs}: HttpsRequest,
    log: Logger,
): Promise<HttpsResult> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, {
            method,
            headers: headers.map((h): [string, string] => [h.name, h.value]),
            body,
            signal: controller.signal,
        });
        clearTimeout(timer);

        return {
            type: 'response',
            result: {status: response.status, body: await response.bytes()},
        };
    } catch (error_: unknown) {
        const error = ensureError(error_);
        log.error(`Request failed: '${error.name}', '${error.message}'`);

        if (error.name === 'AbortError') {
            return {
                type: 'error',
                result: {type: 'timeout', details: error.message},
            };
        }

        return {
            type: 'error',
            result: {type: 'unclassified', details: error.message},
        };
    }
}

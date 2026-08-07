import type {EarlyBackendServicesThatDontRequireConfig} from '~/common/backend';
import {STATIC_CONFIG} from '~/common/config';
import {BackendCreationError} from '~/common/dom/backend/errors';
import * as oppf from '~/common/dom/backend/onprem/oppf';
import type {LoggerFactory} from '~/common/logging';
import {dateToUnixTimestampMs} from '~/common/utils/number';

export function recoverCertificatePins(
    phase1Services: EarlyBackendServicesThatDontRequireConfig,
    logging: LoggerFactory,
    waitForOppfRefresh: () => Promise<void>,
): (password: string) => Promise<{isRemoteSecretActive: boolean}> {
    return async (password: string) => {
        const log = logging.logger('backend.recover-certificate-pins');
        const {onPremConfig, workCredentials, isInnerRemoteSecretProtected} =
            await phase1Services.keyStorage.readIntermediateContents(password);
        const isRemoteSecretActive = isInnerRemoteSecretProtected;

        if (import.meta.env.BUILD_ENVIRONMENT !== 'onprem') {
            throw new BackendCreationError(
                'invalid-environment',
                'Certificate pin recovery is only available in OnPrem builds',
            );
        }

        if (workCredentials === undefined) {
            throw new BackendCreationError(
                'missing-work-credentials',
                'No work credentials found in key storage',
            );
        }

        if (onPremConfig?.oppfUrl === undefined) {
            throw new BackendCreationError('missing-oppf-url', 'No OPPF URL found in key storage');
        }

        const oppfUrl = onPremConfig.oppfUrl;
        const fallbackUrl = oppfUrl.replace(/\.oppf$/u, '.fallback.oppf');

        log.debug(`Fetching fallback OPPF from: ${fallbackUrl}`);

        let responseStatus: number;
        try {
            responseStatus = await phase1Services.electron.checkFallbackOppFile(
                fallbackUrl,
                STATIC_CONFIG.USER_AGENT,
            );
        } catch (error) {
            throw new BackendCreationError(
                'fetch-oppf-error',
                'Unable to detect enabled OPPF fallback endpoint',
                {from: error},
            );
        }
        switch (responseStatus) {
            case 400:
                throw new BackendCreationError(
                    'fetch-oppf-error',
                    "OPPF fallback mustn't send a authorization header",
                );
            case 429:
                throw new BackendCreationError(
                    'fetch-oppf-error',
                    'License check exceeded quota per IP per minute',
                );
            case 404:
                throw new BackendCreationError(
                    'fetch-oppf-error',
                    'Temporary OPPF fallback endpoint has not been activated',
                );
            case 500:
                throw new BackendCreationError(
                    'fetch-oppf-error',
                    'Failed to provide the OPPF fallback',
                );
            default: {
                if (responseStatus !== 200) {
                    throw new BackendCreationError(
                        'fetch-oppf-error',
                        `Unable to fetch OPPF fallback, received status code ${responseStatus}`,
                    );
                }

                break;
            }
        }

        let fallbackOppfData: ArrayBuffer | undefined;
        // Fetch fallback OPPF (this uses an isolated session that bypasses cert validation)
        try {
            fallbackOppfData = await phase1Services.electron.getFallbackOppFile(
                fallbackUrl,
                STATIC_CONFIG.USER_AGENT,
            );
        } catch (error) {
            throw new BackendCreationError('fetch-oppf-error', 'Unable to get OPPF fallback', {
                from: error,
            });
        }

        let oppfFile: {readonly parsed: oppf.OppfFile; readonly string: string};
        // Verify the OPPF file
        try {
            oppfFile = oppf.verifyOppfFile(
                phase1Services,
                STATIC_CONFIG.ONPREM_CONFIG_TRUSTED_PUBLIC_KEYS,
                new Uint8Array(fallbackOppfData),
            );
        } catch (error) {
            throw new BackendCreationError(
                'verify-oppf-file-error',
                'Unable to verify the OPPF fallback file',
                {from: error},
            );
        }

        log.debug('Verified on prem config');

        // Policy B must not be partially activated while endpoint-bearing services still use policy
        // A. Lock the current session, then persist B for an atomic activation on restart.
        try {
            await phase1Services.electron.lockExternalRequestsUntilRestart();
        } catch (error) {
            throw new BackendCreationError(
                'update-public-key-pins-error',
                'Locking external requests until restart failed',
                {from: error},
            );
        }

        log.debug('External requests locked until restart');

        // A cached-start background refresh may still be preparing a key-storage write. Wait until
        // it settles so the verified fallback remains the final policy persisted before restart.
        await waitForOppfRefresh();

        try {
            await phase1Services.keyStorage.setOnPremConfig(password, {
                oppfCachedConfig: oppfFile.string,
                // This is policy provenance, independent of how the inner layer is protected. The
                // next startup consumes it after activating endpoints and pins together.
                oppfCachedConfigIsFallback: true,
                oppfUrl,
                lastUpdated: dateToUnixTimestampMs(new Date()),
            });
        } catch (error) {
            throw new BackendCreationError(
                'update-onprem-config-error',
                'Caching new oppf config in keystorage failed',
                {from: error},
            );
        }

        log.debug('Cached fallback onprem config for restart');

        return {isRemoteSecretActive};
    };
}

import type {EarlyBackendServicesThatDontRequireConfig, ServicesForBackend} from '~/common/backend';
import type {JobCanceller, JobIntervalUpdater} from '~/common/background-job-scheduler';
import {Updater} from '~/common/dom/update';
import type {Logger} from '~/common/logging';
import {WorkError} from '~/common/network/protocol/work';
import {assertUnreachable, unreachable, unwrap} from '~/common/utils/assert';

/**
 * Check the work license supplied by the key storage.
 *
 * Note: This function must not be called before the joinProtocol has succeeded!
 */
export function workLicenseCheckJob(
    services: Pick<ServicesForBackend, 'systemDialog' | 'work' | 'keyStorage'>,
    log: Logger,
): void {
    const workCredentials = unwrap(
        services.keyStorage.workData.get()?.workCredentials,
        'Require work credentials to run work license check job',
    );
    log.debug('Checking Threema work license');
    unwrap(services.work, 'Require work backend to run work license check job')
        .checkLicense(workCredentials)
        .then((result) => {
            if (result.valid) {
                log.debug('Threema Work license is valid');
            } else {
                log.error(`Threema Work credentials are invalid or expired: ${result.message}`);
                services.systemDialog
                    .openOnce({
                        type: 'invalid-work-credentials',
                        context: {
                            workCredentials,
                        },
                    })
                    .catch(assertUnreachable);
            }
        })
        .catch((error: unknown) => {
            log.error(`Work license check failed: ${error}`);
        });
}

export function workSyncJob(
    services: Pick<ServicesForBackend, 'work' | 'keyStorage' | 'model' | 'systemDialog'>,
    log: Logger,
    cancel: JobCanceller,
    update: JobIntervalUpdater,
): void {
    const workCredentials = unwrap(
        services.keyStorage.workData.get()?.workCredentials,
        'Require work credentials to run work sync job',
    );

    const contacts = Array.from(services.model.contacts.getAll().get()).map(
        (contact) => contact.get().view.identity,
    );

    log.debug('Running work sync job');
    unwrap(services.work, 'Require work backend to run work sync job')
        .sync(workCredentials, contacts)
        .then(async (result) => {
            async function fetchLogo(url: string): Promise<Uint8Array> {
                const res = await fetch(url);
                return await res.bytes();
            }

            const light =
                result.logo.light !== undefined
                    ? {
                          url: result.logo.light,
                          blob: await fetchLogo(result.logo.light),
                      }
                    : undefined;

            const dark =
                result.logo.dark !== undefined
                    ? {
                          url: result.logo.dark,
                          blob: await fetchLogo(result.logo.dark),
                      }
                    : undefined;

            services.model.user.workSettings.get().controller.update({
                logo: {
                    light,
                    dark,
                },
                orgName: result.org.name,
                support: result.support,
                threemaMdmParameters: result.mdm.params,
            });

            update(result.checkInterval);
        })
        .catch((error: unknown) => {
            if (!(error instanceof WorkError)) {
                throw error;
            }
            switch (error.type) {
                case 'invalid-credentials':
                    log.debug('Invalid work credentials during work sync.');
                    services.systemDialog
                        .openOnce({
                            type: 'invalid-work-credentials',
                            context: {
                                workCredentials,
                            },
                        })
                        .catch(assertUnreachable);
                    throw error;
                case 'rate-limit-exceeded':
                    log.error('Work sync API rate limit exceeded.');
                    break;
                case 'invalid-response':
                case 'non-work-build':
                case 'fetch':
                    log.error('An error occurred during work sync:', error);
                    throw error;
                default:
                    unreachable(error.type);
            }
        });
}

export function autoUpdateCheckJob(
    services: Pick<
        EarlyBackendServicesThatDontRequireConfig,
        'electron' | 'logging' | 'systemDialog' | 'systemInfo' | 'tempFile'
    >,
    log: Logger,
): void {
    const updater = new Updater(services);
    updater
        .checkAndPerformUpdate({
            forceManualUpdate:
                // Force manual update for sandbox builds.
                import.meta.env.BUILD_ENVIRONMENT === 'sandbox',
        })
        .catch((error: unknown) => {
            log.error(`Update check or download failed: ${error}`);
        });
}

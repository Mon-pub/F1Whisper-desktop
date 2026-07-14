import type {EarlyBackendServicesThatDontRequireConfig, ServicesForBackend} from '~/common/backend';
import type {JobCanceller, JobIntervalUpdater} from '~/common/background-job-scheduler';
import {Updater} from '~/common/dom/update';
import type {Logger} from '~/common/logging';
import {WorkError} from '~/common/network/protocol/work';
import {FEATURE_MASK_FLAG} from '~/common/network/types';
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
        services.keyStorage.workCredentialsStore.get(),
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
        services.keyStorage.workCredentialsStore.get(),
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

/**
 * Declare our own feature mask on the directory server.
 *
 * In the standalone OnPrem (custom) build there is no phone-leader to manage the identity's feature
 * mask, so the desktop must advertise its own capabilities -- exactly as the Android client does via
 * `set_featuremask` after creating an identity.
 *
 * Crucially, multi-device clients do NOT support Forward Security (`IS_FS_SUPPORTED_WITH_MD ===
 * false`): the desktop rejects every incoming FS envelope. If our directory entry still advertised
 * the Forward Security capability bit (the create default), peers would wrap messages in PFS and the
 * desktop would reject them, so messages would never arrive. We therefore advertise the full desktop
 * capability set with the Forward Security bit (`0x40`) cleared.
 *
 * Best-effort + idempotent: re-asserting the same mask is a no-op server-side, and a transient
 * failure is retried on the next interval / next launch.
 */
export function assertOwnFeatureMaskJob(
    services: Pick<ServicesForBackend, 'directory' | 'device'>,
    log: Logger,
): void {
    // Desktop capabilities WITHOUT FORWARD_SECURITY_SUPPORT (see the doc comment above). Derived
    // from FEATURE_MASK_FLAG (rather than a hand-computed hex literal) so a future flag addition
    // can't silently fall out of sync with what the desktop actually advertises.
    const desktopFeatureMaskWithoutFs =
        FEATURE_MASK_FLAG.VOICE_MESSAGE_SUPPORT |
        FEATURE_MASK_FLAG.GROUP_SUPPORT |
        FEATURE_MASK_FLAG.POLL_SUPPORT |
        FEATURE_MASK_FLAG.FILE_MESSAGE_SUPPORT |
        FEATURE_MASK_FLAG.O2O_AUDIO_CALL_SUPPORT |
        FEATURE_MASK_FLAG.O2O_VIDEO_CALL_SUPPORT |
        FEATURE_MASK_FLAG.GROUP_CALL_SUPPORT |
        FEATURE_MASK_FLAG.EDIT_MESSAGE_SUPPORT |
        FEATURE_MASK_FLAG.DELETED_MESSAGES_SUPPORT |
        FEATURE_MASK_FLAG.EMOJI_REACTION_SUPPORT;
    services.directory
        .setFeatureMask(
            services.device.identity.string,
            Number(desktopFeatureMaskWithoutFs),
            services.device.csp.ck,
        )
        .then(() => {
            log.debug('Asserted own feature mask (Forward Security disabled for multi-device)');
        })
        .catch((error: unknown) => {
            log.warn(`Failed to assert own feature mask: ${error}`);
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

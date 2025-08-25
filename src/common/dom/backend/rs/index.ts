import type {ServicesForBackend} from '~/common/backend';
import type {ThreemaWorkData} from '~/common/device';
import {
    KeyStorageError,
    type InnerKeyStorageFileContentsV2,
    type RemoteSecretWriteData,
} from '~/common/key-storage';
import {RsActivationTask} from '~/common/network/protocol/task/libthreema/rs-activation';
import {RsDeactivationTask} from '~/common/network/protocol/task/libthreema/rs-deactivation';
import type {
    BaseUrl,
    IdentityString,
    RemoteSecretAuthenticationToken,
} from '~/common/network/types';
import {assert, unwrap} from '~/common/utils/assert';

export async function handleRemoteSecretMdmParameterChange(
    services: Pick<
        ServicesForBackend,
        'config' | 'device' | 'electron' | 'keyStorage' | 'logging' | 'systemDialog' | 'systemInfo'
    >,
    thRsSet: boolean | undefined,
): Promise<void> {
    const log = services.logging.logger('remote-secret-mdm-parameter-change');
    if (import.meta.env.BUILD_VARIANT === 'consumer') {
        log.warn('RS parameter was set in a consumer build');
        return;
    }
    const {keyStorage} = services;

    const thRsActivated = thRsSet === true;
    const remoteSecretData = keyStorage.remoteSecretData?.get();

    if (
        (thRsActivated && remoteSecretData !== undefined) ||
        (!thRsActivated && remoteSecretData === undefined)
    ) {
        log.debug('Rs is already in the correct state. Returning early.');
        return;
    }

    const workServerBaseUrl = services.config.WORK_SERVER_URL;
    const workData = unwrap(
        services.keyStorage.workData?.get(),
        'Threema Work credentials must be present',
    );
    const identity = services.device.identity.string;
    let keyStorageContent;
    let password: string;
    for (;;) {
        const handle = await services.systemDialog.open({
            type: thRsActivated ? 'remote-secrets-activation' : 'remote-secrets-deactivation',
        });

        const result = await handle.closed;
        assert(result.type === 'confirmed' && result.value !== undefined);
        password = result.value;
        try {
            keyStorageContent = await services.keyStorage.read(password);
            break;
        } catch (error) {
            // Wrong password, try again.
            if (error instanceof KeyStorageError && error.type === 'undecryptable') {
                continue;
            }
            throw error;
        }
    }

    let rsWriteData: RemoteSecretWriteData | undefined = undefined;
    // Value was set but key storage does not know of it yet
    if (thRsActivated && remoteSecretData === undefined) {
        log.debug('Scheduling remote secret activation task');
        rsWriteData = await activateRemoteSecret(
            services,
            workServerBaseUrl,
            workData,
            identity,
            keyStorageContent.identityData.ck,
        );
    } else if (!thRsActivated && remoteSecretData !== undefined) {
        log.debug('Scheduling key storage deactivation task');
        await deactivateRemoteSecret(
            services,
            workServerBaseUrl,
            workData,
            identity,
            keyStorageContent.identityData.ck,
            remoteSecretData.token,
        );
    }

    await services.keyStorage.write(password, keyStorageContent, rsWriteData);
}

export async function activateRemoteSecret(
    services: Pick<ServicesForBackend, 'electron' | 'logging' | 'systemInfo'>,
    workServerBaseUrl: BaseUrl,
    workData: ThreemaWorkData,
    userIdentity: IdentityString,
    ck: InnerKeyStorageFileContentsV2['identityData']['ck'],
): Promise<RemoteSecretWriteData> {
    const task = new RsActivationTask(userIdentity, ck, workData, services, workServerBaseUrl);
    return await task.run();
}

async function deactivateRemoteSecret(
    services: Pick<ServicesForBackend, 'electron' | 'logging' | 'systemInfo'>,
    workServerBaseUrl: BaseUrl,
    workData: ThreemaWorkData,
    userIdentity: IdentityString,
    ck: InnerKeyStorageFileContentsV2['identityData']['ck'],
    rsAuthenticationToken: RemoteSecretAuthenticationToken,
): Promise<void> {
    const task = new RsDeactivationTask(
        userIdentity,
        ck,
        workServerBaseUrl,
        rsAuthenticationToken,
        workData,
        services,
    );

    await task.run();
}

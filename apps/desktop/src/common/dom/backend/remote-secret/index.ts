import type {ServicesForBackend} from '~/common/backend';
import type {ThreemaWorkData} from '~/common/device';
import {
    KeyStorageError,
    type InnerKeyStorageFileContentsV2,
    type RemoteSecretWriteData,
} from '~/common/key-storage';
import {RemoteSecretCreateTask} from '~/common/network/protocol/task/libthreema/remote-secret-create';
import {RemoteSecretDeleteTask} from '~/common/network/protocol/task/libthreema/remote-secret-delete';
import type {
    BaseUrl,
    IdentityString,
    RemoteSecretAuthenticationToken,
} from '~/common/network/types';
import type {SystemDialogHandle} from '~/common/system-dialog';
import {assert, unwrap} from '~/common/utils/assert';
import type {Remote} from '~/common/utils/endpoint';

export async function handleRemoteSecretMdmParameterChange(
    services: Pick<
        ServicesForBackend,
        'config' | 'device' | 'electron' | 'keyStorage' | 'logging' | 'systemDialog' | 'systemInfo'
    >,
    thRemoteSecretSet: boolean | undefined,
): Promise<void> {
    const log = services.logging.logger('remote-secret-mdm-parameter-change');
    if (import.meta.env.BUILD_VARIANT !== 'work' && import.meta.env.BUILD_VARIANT !== 'custom') {
        log.warn('Remote Secret MDM parameter was set in a non-Work or -OnPrem build');
        return;
    }

    const {keyStorage} = services;

    const thRemoteSecretActivated = thRemoteSecretSet === true;
    const remoteSecretData = keyStorage.remoteSecretData.get();

    if (
        (thRemoteSecretActivated && remoteSecretData !== undefined) ||
        (!thRemoteSecretActivated && remoteSecretData === undefined)
    ) {
        log.debug('Remote Secret is already in the correct state. Returning early.');
        return;
    }

    const workServerBaseUrl = services.config.WORK_SERVER_URL;
    const workData = unwrap(
        services.keyStorage.workData.get(),
        'Threema Work credentials must be present',
    );
    const identity = services.device.identity.string;
    let keyStorageContents;
    let password: string | undefined = undefined;
    for (;;) {
        const handle: Remote<SystemDialogHandle> = await services.systemDialog.open({
            type: thRemoteSecretActivated
                ? 'remote-secrets-activation'
                : 'remote-secrets-deactivation',
            context: {
                previouslyAttemptedPassword: password,
            },
        });

        const result = await handle.closed;
        assert(result.type === 'confirmed' && result.value !== undefined);
        password = result.value;
        try {
            keyStorageContents = await services.keyStorage.readContents(password);
            break;
        } catch (error) {
            // Wrong password, try again.
            if (error instanceof KeyStorageError && error.type === 'undecryptable') {
                continue;
            }
            throw error;
        }
    }

    let remoteSecretWriteData: RemoteSecretWriteData | undefined = undefined;
    // Value was set but key storage does not know of it yet
    if (thRemoteSecretActivated && remoteSecretData === undefined) {
        log.debug('Scheduling remote secret activation task');
        remoteSecretWriteData = await activateRemoteSecret(
            services,
            workServerBaseUrl,
            workData,
            identity,
            keyStorageContents.intermediateContents.innerContents.identityData.ck,
        );
    } else if (!thRemoteSecretActivated && remoteSecretData !== undefined) {
        log.debug('Scheduling remote secret deactivation task');
        await deactivateRemoteSecret(
            services,
            workServerBaseUrl,
            workData,
            identity,
            keyStorageContents.intermediateContents.innerContents.identityData.ck,
            remoteSecretData.token,
        );
    }

    // Override key storage and pass `remoteSecretWriteData`, so that the inner key storage is
    // re-encrypted using the remote secret.
    await services.keyStorage.createOrOverride(password, keyStorageContents, remoteSecretWriteData);
}

export async function activateRemoteSecret(
    services: Pick<ServicesForBackend, 'electron' | 'logging' | 'systemInfo'>,
    workServerBaseUrl: BaseUrl,
    workData: ThreemaWorkData,
    userIdentity: IdentityString,
    ck: InnerKeyStorageFileContentsV2['identityData']['ck'],
): Promise<RemoteSecretWriteData> {
    const task = new RemoteSecretCreateTask(
        userIdentity,
        ck,
        workData,
        services,
        workServerBaseUrl,
    );
    return await task.run();
}

async function deactivateRemoteSecret(
    services: Pick<ServicesForBackend, 'electron' | 'logging' | 'systemInfo'>,
    workServerBaseUrl: BaseUrl,
    workData: ThreemaWorkData,
    userIdentity: IdentityString,
    ck: InnerKeyStorageFileContentsV2['identityData']['ck'],
    remoteSecretAuthenticationToken: RemoteSecretAuthenticationToken,
): Promise<void> {
    const task = new RemoteSecretDeleteTask(
        userIdentity,
        ck,
        workServerBaseUrl,
        remoteSecretAuthenticationToken,
        workData,
        services,
    );

    await task.run();
}

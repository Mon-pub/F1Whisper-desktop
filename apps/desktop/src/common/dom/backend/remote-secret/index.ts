import type {ServicesForBackend} from '~/common/backend';
import type {ThreemaWorkData} from '~/common/device';
import type {KeyStorageRemoteSecretWriteData} from '~/common/key-storage';
import {KeyStorageError} from '~/common/key-storage/common';
import {RemoteSecretCreateTask} from '~/common/network/protocol/task/libthreema/remote-secret-create';
import {RemoteSecretDeleteTask} from '~/common/network/protocol/task/libthreema/remote-secret-delete';
import type {
    BaseUrl,
    IdentityString,
    RemoteSecretAuthenticationToken,
} from '~/common/network/types';
import type {RawClientKey} from '~/common/network/types/keys';
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
    const remoteSecretData = keyStorage.remoteSecretDataStore.get();

    if (
        (thRemoteSecretActivated && remoteSecretData !== undefined) ||
        (!thRemoteSecretActivated && remoteSecretData === undefined)
    ) {
        log.debug('Remote Secret is already in the correct state. Returning early.');
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const workServerBaseUrl = services.config.WORK_SERVER_LEGACY_URL;
    const workCredentials = unwrap(
        services.keyStorage.workCredentialsStore.get(),
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

    let remoteSecretWriteData: KeyStorageRemoteSecretWriteData | undefined = undefined;
    // Value was set but key storage does not know of it yet
    if (thRemoteSecretActivated && remoteSecretData === undefined) {
        log.debug('Scheduling remote secret activation task');
        remoteSecretWriteData = await activateRemoteSecret(
            services,
            workServerBaseUrl,
            {workCredentials},
            identity,
            keyStorageContents.inner.identityData.ck,
        );
    } else if (!thRemoteSecretActivated && remoteSecretData !== undefined) {
        log.debug('Scheduling remote secret deactivation task');
        await deactivateRemoteSecret(
            services,
            workServerBaseUrl,
            {workCredentials},
            identity,
            keyStorageContents.inner.identityData.ck,
            remoteSecretData.token,
        );
    }

    // Override key storage and pass `remoteSecretWriteData`, so that the inner key storage is
    // re-encrypted using the remote secret.
    await services.keyStorage.setRemoteSecret(password, remoteSecretWriteData);
}

export async function activateRemoteSecret(
    services: Pick<ServicesForBackend, 'electron' | 'logging' | 'systemInfo'>,
    workServerBaseUrl: BaseUrl,
    workData: ThreemaWorkData,
    userIdentity: IdentityString,
    ck: RawClientKey,
): Promise<KeyStorageRemoteSecretWriteData> {
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
    ck: RawClientKey,
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

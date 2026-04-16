import * as libthreema from '@threema/libthreema-wasm';

import type {ServicesForBackend} from '~/common/backend';
import type {ThreemaWorkData} from '~/common/device';
import type {KeyStorageRemoteSecretWriteData} from '~/common/key-storage';
import type {Logger} from '~/common/logging';
import type {LibthreemaTask} from '~/common/network/protocol/task/libthreema';
import {
    createWorkContext,
    doRequest,
    getClientInfo,
} from '~/common/network/protocol/task/libthreema/utils';
import {
    ensureRemoteSecretAuthenticationToken,
    ensureRemoteSecretHash,
    wrapRemoteSecret,
    type BaseUrl,
    type IdentityString,
} from '~/common/network/types';
import type {RawClientKey} from '~/common/network/types/keys';
import {assertUnreachable, unreachable} from '~/common/utils/assert';

export class RemoteSecretCreateTask
    implements LibthreemaTask<Promise<KeyStorageRemoteSecretWriteData>>
{
    private readonly _log: Logger;
    private readonly _libthreemaTask: libthreema.RemoteSecretCreateTask;
    public constructor(
        identity: IdentityString,
        clientKey: RawClientKey,
        private readonly _workData: ThreemaWorkData,
        private readonly _services: Pick<ServicesForBackend, 'electron' | 'logging' | 'systemInfo'>,
        private readonly _workServerUrl: BaseUrl,
    ) {
        this._log = this._services.logging.logger('libthreema.remote-secret-activation-task');
        this._libthreemaTask = libthreema.RemoteSecretCreateTask.new({
            clientInfo: getClientInfo(this._services),
            clientKey: clientKey.unwrap(),
            userIdentity: identity,
            workContext: createWorkContext(this._workData),
            workServerBaseUrl: this._workServerUrl.toString(),
        });
    }
    public async run(): Promise<KeyStorageRemoteSecretWriteData> {
        for (;;) {
            const pollResult = this._libthreemaTask.poll();
            switch (pollResult.type) {
                case 'create-loop': {
                    const instruction = pollResult.value;
                    switch (instruction.type) {
                        case 'instruction': {
                            const result = await doRequest(instruction.value, this._log);
                            this._libthreemaTask.response(result);
                            continue;
                        }
                        case 'done':
                            return {
                                endpoint: this._workServerUrl,
                                hash: ensureRemoteSecretHash(instruction.value.remoteSecretHash),
                                token: ensureRemoteSecretAuthenticationToken(
                                    instruction.value.remoteSecretAuthenticationToken,
                                ),
                                raw: wrapRemoteSecret(instruction.value.remoteSecret),
                            };
                        default:
                            return unreachable(instruction);
                    }
                }
                case 'error':
                    await this._handleError(pollResult.value).catch(assertUnreachable);
                    continue;
                default:
                    unreachable(pollResult);
            }
        }
    }

    private async _handleError(error: libthreema.RemoteSecretSetupError): Promise<void> {
        this._log.error(`Remote Secret create error: '${error.type}'`);
        await this._services.electron.remoteSecretErrorRestartApp(error.type);
    }
}

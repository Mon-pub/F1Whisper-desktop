import * as libthreema from 'libthreema';

import type {ServicesForBackend} from '~/common/backend';
import type {ThreemaWorkData} from '~/common/device';
import type {Logger} from '~/common/logging';
import type {LibthreemaTask} from '~/common/network/protocol/task/libthreema';
import {
    createWorkContext,
    doRequest,
    getClientInfo,
} from '~/common/network/protocol/task/libthreema/utils';
import type {
    BaseUrl,
    IdentityString,
    RemoteSecretAuthenticationToken,
} from '~/common/network/types';
import type {RawClientKey} from '~/common/network/types/keys';
import {assertUnreachable, unreachable} from '~/common/utils/assert';

export class RsDeactivationTask implements LibthreemaTask<void> {
    private readonly _log: Logger;
    private readonly _libthreemaTask: libthreema.RemoteSecretDeleteTask;

    public constructor(
        identity: IdentityString,
        clientKey: RawClientKey,
        workServerUrl: BaseUrl,
        remoteSecretAuthenticationToken: RemoteSecretAuthenticationToken,
        private readonly _workData: ThreemaWorkData,
        private readonly _services: Pick<ServicesForBackend, 'electron' | 'logging' | 'systemInfo'>,
    ) {
        this._log = this._services.logging.logger('libthreema.rs-deactivation-task');

        this._libthreemaTask = libthreema.RemoteSecretDeleteTask.new(
            {
                clientInfo: getClientInfo(this._services),
                clientKey: clientKey.unwrap(),
                userIdentity: identity,
                workContext: createWorkContext(this._workData),
                workServerBaseUrl: workServerUrl.toString(),
            },
            remoteSecretAuthenticationToken as unknown as Uint8Array,
        );
    }
    public async run(): Promise<void> {
        for (;;) {
            const pollResult = this._libthreemaTask.poll();
            switch (pollResult.type) {
                case 'delete-loop': {
                    const instruction = pollResult.value;
                    switch (instruction.type) {
                        case 'instruction': {
                            const result = await doRequest(instruction.value, this._log);
                            this._libthreemaTask.response(result);
                            continue;
                        }
                        case 'done':
                            return undefined;
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
        this._log.error(`RS Activation error: '${error.type}'`);
        await this._services.electron.remoteSecretErrorRestartApp(error.type);
    }
}

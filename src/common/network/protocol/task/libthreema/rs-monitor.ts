import {
    RemoteSecretMonitorProtocol,
    type RemoteSecretMonitorError,
    type RemoteSecretMonitorInstruction,
} from 'libthreema';

import type {ServicesForBackend} from '~/common/backend';
import type {Logger} from '~/common/logging';
import type {LibthreemaRecurringTask} from '~/common/network/protocol/task/libthreema';
import {doRequest, getClientInfo} from '~/common/network/protocol/task/libthreema/utils';
import {
    wrapRemoteSecret,
    type RawRemoteSecret,
    type RemoteSecretData,
} from '~/common/network/types';
import type {u53} from '~/common/types';
import {unreachable} from '~/common/utils/assert';

interface RsMonitorTaskReturnType {
    readonly timeoutMs: u53;
    readonly remoteSecret: RawRemoteSecret | undefined;
}

export class RsMonitorTask implements LibthreemaRecurringTask<RsMonitorTaskReturnType> {
    private readonly _remoteSecretMonitorProtocol: RemoteSecretMonitorProtocol;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: Pick<ServicesForBackend, 'systemInfo' | 'electron' | 'logging'>,
        remoteSecretData: RemoteSecretData,
    ) {
        this._log = _services.logging.logger('libthreema.rs-monitoring-task');
        this._remoteSecretMonitorProtocol = RemoteSecretMonitorProtocol.new(
            getClientInfo(_services),
            remoteSecretData.endpoint.toString(),
            remoteSecretData.token as unknown as Uint8Array,
            remoteSecretData.hash as unknown as Uint8Array,
        );
    }

    public async run(): Promise<RsMonitorTaskReturnType> {
        let timeoutMs = -1;
        let remoteSecret: RawRemoteSecret | undefined = undefined;
        do {
            const {type, result} = this._remoteSecretMonitorProtocol.poll();
            switch (type) {
                case 'instruction': {
                    ({timeoutMs, remoteSecret} = await this._executeInstruction(result));
                    break;
                }

                case 'error':
                    await this._handleError(result);
                    break;

                default:
                    return unreachable(type);
            }
        } while (timeoutMs < 0);

        return {timeoutMs, remoteSecret};
    }

    private async _executeInstruction({
        type,
        value,
    }: RemoteSecretMonitorInstruction): Promise<RsMonitorTaskReturnType> {
        switch (type) {
            case 'request': {
                const result = await doRequest(value, this._log);
                const rsMonitorError = this._remoteSecretMonitorProtocol.response(result);
                if (rsMonitorError !== undefined) {
                    await this._handleError(rsMonitorError);
                }
                return {timeoutMs: -1, remoteSecret: undefined};
            }
            case 'schedule':
                return {
                    timeoutMs: value.timeoutMs,
                    remoteSecret:
                        value.remoteSecret !== undefined
                            ? wrapRemoteSecret(value.remoteSecret)
                            : undefined,
                };

            default:
                return unreachable(type);
        }
    }

    private async _handleError(error: RemoteSecretMonitorError): Promise<void> {
        this._log.error(`Monitoring error: '${error.type}'`);
        await this._services.electron.remoteSecretErrorRestartApp(error.type);
    }
}

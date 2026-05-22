import * as libthreema from '@threema/libthreema-wasm';

import type {ServicesForBackend} from '~/common/backend';
import type {RawKey} from '~/common/crypto';
import type {ThreemaWorkData} from '~/common/device';
import type {Logger} from '~/common/logging';
import type {ServicesForModel} from '~/common/model';
import type {LibthreemaTask} from '~/common/network/protocol/task/libthreema';
import {
    createWorkContext,
    doRequest,
    getClientInfo,
} from '~/common/network/protocol/task/libthreema/utils';
import type {BaseUrl, IdentityString} from '~/common/network/types';
import {unreachable} from '~/common/utils/assert';

export class WorkPropertiesUpdateTask implements LibthreemaTask<Promise<boolean>> {
    private readonly _log: Logger;
    private readonly _libthreemaTask: libthreema.WorkPropertiesUpdateTask;

    public constructor(
        identity: IdentityString,
        clientKey: RawKey<32>,
        private readonly _workProperties: libthreema.WorkProperties,
        private readonly _workData: ThreemaWorkData,
        private readonly _services: Pick<
            ServicesForBackend | ServicesForModel,
            'logging' | 'systemInfo'
        >,
        private readonly _workServerUrl: BaseUrl,
    ) {
        this._log = this._services.logging.logger('libthreema.work-properties-update-task');

        const context: libthreema.WorkPropertiesUpdateContext = {
            clientInfo: getClientInfo(this._services),
            clientKey: clientKey.unwrap(),
            userIdentity: identity,
            workContext: createWorkContext(this._workData),
            workServerBaseUrl: _workServerUrl.toString(),
        };

        this._libthreemaTask = libthreema.WorkPropertiesUpdateTask.new(
            context,
            this._workProperties,
        );
    }

    public async run(): Promise<boolean> {
        for (;;) {
            const pollResult = this._libthreemaTask.poll();
            switch (pollResult.type) {
                case 'update-loop': {
                    const instruction = pollResult.value;
                    switch (instruction.type) {
                        case 'instruction': {
                            const result = await doRequest(instruction.value, this._log);
                            this._libthreemaTask.response(result);
                            continue;
                        }
                        case 'done':
                            this._log.info(`Update work properties: ${instruction.type}`);
                            return true;
                        default:
                            return unreachable(instruction);
                    }
                }
                case 'error':
                    this._log.error(
                        `Work properties update task error: '${pollResult.value.type}'`,
                    );
                    return false;
                default:
                    unreachable(pollResult);
            }
        }
    }
}

import {
    CreateIdentityTask,
    type ClientInfo,
    type ConfigEnvironment,
    type CreateIdentityResult,
    type Flavor,
} from '@threema/libthreema-wasm';

import type {Logger, LoggerFactory} from '~/common/logging';
import type {LibthreemaTask} from '~/common/network/protocol/task/libthreema';
import {doRequest} from '~/common/network/protocol/task/libthreema/utils';
import {unreachable} from '~/common/utils/assert';

export class IdentityCreateTask implements LibthreemaTask<Promise<CreateIdentityResult>> {
    private readonly _log: Logger;
    private readonly _libthreemaTask: CreateIdentityTask;

    public constructor(
        private readonly _clientInfo: ClientInfo,
        private readonly _logging: LoggerFactory,
    ) {
        this._log = this._logging.logger('libthreema.create-identity-task');

        this._libthreemaTask = CreateIdentityTask.new({
            clientInfo: _clientInfo,
            configEnvironment: this._getConfigEnvironment(),
            flavor: this._getFlavor(),
        });
    }
    public async run(): Promise<CreateIdentityResult> {
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
                            this._log.info(
                                `New identity created: ${instruction.value.userIdentity}`,
                            );
                            return instruction.value;
                        default:
                            return unreachable(instruction);
                    }
                }
                case 'error':
                    this._log.error(`Create identity task error: '${pollResult.value.type}'`);
                    break;
                default:
                    unreachable(pollResult);
            }
        }
    }

    private _getConfigEnvironment(): ConfigEnvironment {
        // At the moment, we use this task for testing purposes only. Therefore, we keep it simple
        // and hardcode ‘consumer-sandbox’. However, once the desktop standalone feature is
        // requested, we have to implement it correctly for all environments.
        return {type: 'sandbox'};
    }

    private _getFlavor(): Flavor {
        // At the moment, we use this task for testing purposes only. Therefore, we keep it simple
        // and hardcode ‘consumer-sandbox’. However, once the desktop standalone feature is
        // requested, we have to implement it correctly for all flavor.
        return {flavor: 'consumer'};
    }
}

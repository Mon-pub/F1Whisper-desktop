import {RemoteSecretMonitorProtocol, type RemoteSecretMonitorError} from '@threema/libthreema-wasm';

import type {ServicesForBackend} from '~/common/backend';
import type {BackgroundJobScheduler, JobHandle} from '~/common/background-job-scheduler';
import type {Logger} from '~/common/logging';
import type {
    LibthreemaRecurringTask,
    LibthreemaTask,
} from '~/common/network/protocol/task/libthreema';
import {doRequest, getClientInfo} from '~/common/network/protocol/task/libthreema/utils';
import {
    wrapRemoteSecret,
    type RawRemoteSecret,
    type RemoteSecretData,
} from '~/common/network/types';
import type {u53} from '~/common/types';
import {assertUnreachable, unreachable} from '~/common/utils/assert';
import {Delayed} from '~/common/utils/delayed';
import {TIMER} from '~/common/utils/timer';

interface RemoteSecretMonitorTaskResult {
    /**
     * The duration to wait before running the next {@link RemoteSecretMonitorTask}.
     */
    readonly timeoutMs: u53;
}

interface RemoteSecretApplicationStartMonitorTaskResult {
    /**
     * The initial duration to wait before running the first recurring {@link RemoteSecretMonitorTask}.
     */
    readonly initialTimeoutMs: u53;
    readonly remoteSecret: RawRemoteSecret;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export abstract class RemoteSecretMonitoringBase {
    /**
     * Initialize the monitoring protocol (if applicable).
     */
    public static init(
        services: Pick<ServicesForBackend, 'systemInfo' | 'keyStorage' | 'electron' | 'logging'>,
        backgroundJobScheduler: BackgroundJobScheduler,
    ): RemoteSecretMonitoringBase {
        // Do nothing.
        throw new Error('Init method must be overwritten by inheriting classes');
    }
}

/**
 * Stub monitoring backend without functionality, whatsoever.
 *
 * Should only exist in `consumer` builds.
 */
export class StubRemoteSecretMonitoringProtocolBackend extends RemoteSecretMonitoringBase {
    private constructor() {
        super();
    }
    /** @inheritdoc */
    public static override init(
        services: Pick<ServicesForBackend, 'systemInfo' | 'keyStorage' | 'electron' | 'logging'>,
        backgroundJobScheduler: BackgroundJobScheduler,
    ): StubRemoteSecretMonitoringProtocolBackend {
        return new StubRemoteSecretMonitoringProtocolBackend();
    }
}

/**
 * Remote secret monitoring backend.
 *
 * This class holds one instance of the monitoring backend and lives over the lifetime of the
 * application. It schedules a recurring task as soon as the application is started and Remote Secret is activated.
 */
export class RemoteSecretMonitoringProtocolBackend extends RemoteSecretMonitoringBase {
    private readonly _remoteSecretMonitorProtocol: Delayed<RemoteSecretMonitorProtocol>;
    private readonly _log: Logger;
    private readonly _backgroundJobHandle: JobHandle;

    private constructor(
        private readonly _services: Pick<
            ServicesForBackend,
            'systemInfo' | 'keyStorage' | 'electron' | 'logging'
        >,
        backgroundJobScheduler: BackgroundJobScheduler,
    ) {
        super();

        this._remoteSecretMonitorProtocol = Delayed.simple<RemoteSecretMonitorProtocol>(
            'RemoteSecretMonitorProtocol',
        );

        this._log = this._services.logging.logger(`libthreema.rs-monitoring-protocol`);

        // Schedule a recurring job running the protocol.
        this._backgroundJobHandle = backgroundJobScheduler.scheduleRecurringJob(
            (log) => {
                log.debug('Starting libthreema job');
                this._runProtocol(this._services.keyStorage.remoteSecretData.get()).catch(
                    assertUnreachable,
                );
            },
            {
                tag: 'remote-secret-monitor',
                intervalS: 10,
                initialTimeoutS: 1,
            },
        );
    }

    /** @inheritdoc */
    public static override init(
        services: Pick<ServicesForBackend, 'systemInfo' | 'keyStorage' | 'electron' | 'logging'>,
        backgroundJobScheduler: BackgroundJobScheduler,
    ): RemoteSecretMonitoringProtocolBackend {
        const remoteSecretMontitoringProtocol = new RemoteSecretMonitoringProtocolBackend(
            services,
            backgroundJobScheduler,
        );

        // Subscribe to the remote secret source of truth. Restart or stop the background task
        // depending on the value.
        remoteSecretMontitoringProtocol._services.keyStorage.remoteSecretData.subscribe(
            (remoteSecretData) => {
                if (remoteSecretData === undefined) {
                    remoteSecretMontitoringProtocol._log.debug('Cancelling libthreema job');
                    remoteSecretMontitoringProtocol._backgroundJobHandle.cancel();
                    return;
                }
                remoteSecretMontitoringProtocol._backgroundJobHandle.update(
                    remoteSecretData.initialTimeoutMs / 1000,
                );
            },
        );

        return remoteSecretMontitoringProtocol;
    }

    private async _runProtocol(remoteSecretData: RemoteSecretData | undefined): Promise<void> {
        this._backgroundJobHandle.cancel();
        if (remoteSecretData === undefined) {
            return;
        }

        if (!this._remoteSecretMonitorProtocol.isSet()) {
            this._remoteSecretMonitorProtocol.set(
                RemoteSecretMonitorProtocol.new(
                    getClientInfo(this._services),
                    remoteSecretData.endpoint.toString(),
                    remoteSecretData.token as unknown as Uint8Array,
                    remoteSecretData.hash as unknown as Uint8Array,
                ),
            );
        }

        const task = new RemoteSecretMonitorTask(
            this._services,
            // Can be unwrapped since we set it just above.
            this._remoteSecretMonitorProtocol.unwrap(),
        );
        const {timeoutMs} = await task.run();
        this._log.debug(
            `Successfully ran one iteration of Monitor protocol. Rescheduling in: ${timeoutMs} ms`,
        );
        this._backgroundJobHandle.update(timeoutMs / 1000);
    }
}

/**
 * A task for monitoring the Remote Secret during the application's lifetime. Yields the `timeoutMs`
 * for when the next {@link RemoteSecretMonitorTask} needs to be scheduled if the check was successful. Does
 * not throw, but will force an app restart on failure.
 */
export class RemoteSecretMonitorTask
    implements LibthreemaRecurringTask<RemoteSecretMonitorTaskResult>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: Pick<ServicesForBackend, 'systemInfo' | 'electron' | 'logging'>,
        private readonly _remoteSecretMonitorProtocol: RemoteSecretMonitorProtocol,
    ) {
        this._log = _services.logging.logger(`libthreema.remote-secret-monitor-task`);
    }

    public async run(): Promise<RemoteSecretMonitorTaskResult> {
        for (;;) {
            const pollResult = this._remoteSecretMonitorProtocol.poll();
            switch (pollResult.type) {
                case 'instruction': {
                    const instruction = pollResult.result;
                    switch (instruction.type) {
                        case 'request': {
                            const result = await doRequest(instruction.value, this._log);
                            const remoteSecretMonitorError =
                                this._remoteSecretMonitorProtocol.response(result);
                            if (remoteSecretMonitorError !== undefined) {
                                return await this._handleError(remoteSecretMonitorError);
                            }

                            // Continue to next iteration to poll again.
                            continue;
                        }

                        case 'schedule':
                            return instruction.value;

                        default:
                            return unreachable(instruction);
                    }
                }

                case 'error':
                    return await this._handleError(pollResult.result);

                default:
                    return unreachable(pollResult);
            }
        }
    }

    private async _handleError(error: RemoteSecretMonitorError): Promise<never> {
        this._log.error(`Remote Secret monitoring error: '${error.type}'`);
        await this._services.electron.beforeRestart();
        await this._services.electron.remoteSecretErrorRestartApp(error.type);
        return assertUnreachable(
            'Function remoteSecretErrorRestartApp is never expected to return',
        );
    }
}

/**
 * A variant of the {@link RemoteSecretMonitorTask} which is meant to be run as part of the _Application Start
 * Steps_. Unlike the `RemoteSecretMonitorTask`, this task requires a Remote Secret to be yielded to complete
 * successfully. Does not throw, but will force an app restart on failure.
 */
export class RemoteSecretApplicationStartMonitorTask
    implements LibthreemaTask<Promise<RemoteSecretApplicationStartMonitorTaskResult>>
{
    private readonly _log: Logger;
    private readonly _remoteSecretMonitorProtocol: RemoteSecretMonitorProtocol;

    public constructor(
        private readonly _services: Pick<ServicesForBackend, 'systemInfo' | 'electron' | 'logging'>,
        remoteSecretData: RemoteSecretData,
    ) {
        this._log = _services.logging.logger(
            `libthreema.remote-secret-application-start-monitor-task`,
        );

        this._remoteSecretMonitorProtocol = RemoteSecretMonitorProtocol.new(
            getClientInfo(this._services),
            remoteSecretData.endpoint.toString(),
            remoteSecretData.token as unknown as Uint8Array,
            remoteSecretData.hash as unknown as Uint8Array,
        );
    }

    public async run(): Promise<RemoteSecretApplicationStartMonitorTaskResult> {
        for (;;) {
            const pollResult = this._remoteSecretMonitorProtocol.poll();
            switch (pollResult.type) {
                case 'instruction': {
                    const instruction = pollResult.result;
                    switch (instruction.type) {
                        case 'request': {
                            const result = await doRequest(instruction.value, this._log);
                            const remoteSecretMonitorError =
                                this._remoteSecretMonitorProtocol.response(result);
                            if (remoteSecretMonitorError !== undefined) {
                                return await this._handleError(remoteSecretMonitorError);
                            }

                            // Continue to next iteration to poll again.
                            continue;
                        }

                        case 'schedule': {
                            const {remoteSecret, timeoutMs} = instruction.value;

                            // If no `remoteSecret` was yielded yet, wait for `timeoutMs` and
                            // continue to next iteration to poll again.
                            if (remoteSecret === undefined) {
                                await TIMER.sleep(timeoutMs);
                                continue;
                            }

                            return {
                                initialTimeoutMs: timeoutMs,
                                remoteSecret: wrapRemoteSecret(remoteSecret),
                            };
                        }

                        default:
                            return unreachable(instruction);
                    }
                }

                case 'error':
                    return await this._handleError(pollResult.result);

                default:
                    return unreachable(pollResult);
            }
        }
    }

    private async _handleError(error: RemoteSecretMonitorError): Promise<never> {
        this._log.error(`Remote Secret monitoring error: '${error.type}'`);
        await this._services.electron.beforeRestart();
        await this._services.electron.remoteSecretErrorRestartApp(error.type);
        return assertUnreachable(
            'Function remoteSecretErrorRestartApp is never expected to return',
        );
    }
}

import {
    RemoteSecretMonitorProtocol,
    type RemoteSecretMonitorError,
    type RemoteSecretMonitorInstruction,
} from 'libthreema';

import type {ServicesForBackend} from '~/common/backend';
import type {BackgroundJobScheduler, JobHandle} from '~/common/background-job-scheduler';
import type {Logger} from '~/common/logging';
import type {LibthreemaRecurringTask} from '~/common/network/protocol/task/libthreema';
import {doRequest, getClientInfo} from '~/common/network/protocol/task/libthreema/utils';
import {
    wrapRemoteSecret,
    type RawRemoteSecret,
    type RemoteSecretData,
} from '~/common/network/types';
import type {u53} from '~/common/types';
import {assert, assertUnreachable, unreachable} from '~/common/utils/assert';
import {Delayed} from '~/common/utils/delayed';

interface RsMonitorTaskReturnType {
    readonly timeoutMs: u53;
    readonly remoteSecret: RawRemoteSecret | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export abstract class RsMonitoringBase {
    /**
     * Initialize the monitoring protocol (if applicable).
     */
    public static init(
        services: Pick<ServicesForBackend, 'systemInfo' | 'keyStorage' | 'electron' | 'logging'>,
        backgroundJobScheduler: BackgroundJobScheduler,
    ): RsMonitoringBase {
        // Do nothing.
        throw new Error('Init method must be overwritten by inheriting classes');
    }
}

/**
 * Stub monitoring backend without functionality, whatsoever.
 *
 * Should only exist in `consumer` builds.
 */
export class StubRsMonitoringProtocolBackend extends RsMonitoringBase {
    private constructor() {
        super();
    }
    /** @inheritdoc */
    public static override init(
        services: Pick<ServicesForBackend, 'systemInfo' | 'keyStorage' | 'electron' | 'logging'>,
        backgroundJobScheduler: BackgroundJobScheduler,
    ): StubRsMonitoringProtocolBackend {
        return new StubRsMonitoringProtocolBackend();
    }
}

/**
 * Remote secret monitoring backend.
 *
 * This class holds one instance of the monitoring backend and lives over the lifetime of the
 * application. It schedules a recurring task as soon as the application is started and RS is activated.
 */
export class RsMonitoringProtocolBackend extends RsMonitoringBase {
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
                this._runProtocol(this._services.keyStorage.remoteSecretData?.get()).catch(
                    assertUnreachable,
                );
            },
            {
                tag: 'rs-monitor',
                intervalS: 10,
                initialTimeoutS: 1,
            },
        );
    }

    /** @inheritdoc */
    public static override init(
        services: Pick<ServicesForBackend, 'systemInfo' | 'keyStorage' | 'electron' | 'logging'>,
        backgroundJobScheduler: BackgroundJobScheduler,
    ): RsMonitoringProtocolBackend {
        const rsMontitoringProtocol = new RsMonitoringProtocolBackend(
            services,
            backgroundJobScheduler,
        );

        assert(
            rsMontitoringProtocol._services.keyStorage.remoteSecretData !== undefined,
            'RsMonitoringProtocolBackend can only be used in work builds',
        );

        // Subscribe to the remote secret source of truth. Restart or stop the background task
        // depending on the value.
        rsMontitoringProtocol._services.keyStorage.remoteSecretData.subscribe(
            (remoteSecretData) => {
                if (remoteSecretData === undefined) {
                    rsMontitoringProtocol._log.debug('Cancelling libthreema job');
                    rsMontitoringProtocol._backgroundJobHandle.cancel();
                    return;
                }
                rsMontitoringProtocol._backgroundJobHandle.update(
                    remoteSecretData.initialTimeoutMs / 1000,
                );
            },
        );

        return rsMontitoringProtocol;
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

        const task = new RsMonitorTask(this._services, {
            recurring: true,
            // Can be unwrapped since we set it just above.
            remoteSecretMonitorProtocol: this._remoteSecretMonitorProtocol.unwrap(),
        });
        const {timeoutMs} = await task.run();
        this._log.debug(
            `Successfully ran one iteration of Monitor protocol. Rescheduling in: ${timeoutMs} ms`,
        );
        this._backgroundJobHandle.update(timeoutMs / 1000);
    }
}

/**
 * A Remote Secret monitor task.
 *
 * If this is a recurring task, the protocol must already be instantiated and exist. If not, the
 * protocol is instantiated and used only once.
 */
export class RsMonitorTask implements LibthreemaRecurringTask<RsMonitorTaskReturnType> {
    private readonly _log: Logger;
    private readonly _remoteSecretMonitorProtocol: RemoteSecretMonitorProtocol;

    public constructor(
        private readonly _services: Pick<ServicesForBackend, 'systemInfo' | 'electron' | 'logging'>,
        taskType:
            | {
                  readonly recurring: true;
                  readonly remoteSecretMonitorProtocol: RemoteSecretMonitorProtocol;
              }
            | {
                  readonly recurring: false;
                  readonly remoteSecretData: RemoteSecretData;
              },
    ) {
        this._log = _services.logging.logger(
            `libthreema.rs-${taskType.recurring ? 'recurring' : 'one-time'}-monitoring-task`,
        );

        this._remoteSecretMonitorProtocol = taskType.recurring
            ? taskType.remoteSecretMonitorProtocol
            : RemoteSecretMonitorProtocol.new(
                  getClientInfo(this._services),
                  taskType.remoteSecretData.endpoint.toString(),
                  taskType.remoteSecretData.token as unknown as Uint8Array,
                  taskType.remoteSecretData.hash as unknown as Uint8Array,
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

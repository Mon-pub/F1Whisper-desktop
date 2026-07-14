import {
    CreateIdentityTask,
    type ClientInfo,
    type ConfigEnvironment,
    type CreateIdentityResult,
    type Flavor,
    type HttpsRequest,
} from '@threema/libthreema-wasm';

import type {Logger, LoggerFactory} from '~/common/logging';
import type {LibthreemaTask} from '~/common/network/protocol/task/libthreema';
import {doRequest} from '~/common/network/protocol/task/libthreema/utils';
import {unreachable} from '~/common/utils/assert';
import {UTF8} from '~/common/utils/codec';
import {hasProperty} from '~/common/utils/object';

/**
 * Inject the `deviceId` into the libthreema create **phase 2** request body, leaving every other
 * request untouched.
 *
 * Our OnPrem directory server's `POST /identity/create` phase 2 requires a `deviceId` (it derives a
 * keyed device-binding hash from it), but the audited libthreema-wasm `CreateIdentityTask` never
 * sends one. Rather than patch the wasm, the `deviceId` is spliced into the already-serialized JSON
 * body here, at the HTTP layer. The phase-1 (authentication challenge) request carries no `token`
 * field; the phase-2 request does, so the presence of `token` distinguishes the two without
 * re-deriving any crypto.
 *
 * If the request is not the create phase-2 request, or the body cannot be parsed as the expected
 * JSON object, the original request is returned unmodified (defensive: never break a request we do
 * not understand).
 */
function injectDeviceIdIntoCreatePhase2(
    request: HttpsRequest,
    deviceId: string,
    log: Logger,
): HttpsRequest {
    // Only the create-identity POST is a candidate. The directory base URL always ends with a
    // trailing slash, so the create path is exactly `<base>/identity/create` (no query string).
    if (request.method !== 'post' || !request.url.endsWith('/identity/create')) {
        return request;
    }

    let parsedBody: Record<string, unknown>;
    try {
        const decoded: unknown = JSON.parse(UTF8.decode(request.body));
        if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
            return request;
        }
        parsedBody = decoded as Record<string, unknown>;
    } catch (error) {
        log.warn(`Could not parse create-identity request body for deviceId injection: ${error}`);
        return request;
    }

    // Phase 1 (authentication challenge) has no `token`; phase 2 (authenticated create) does. Only
    // inject into phase 2.
    if (!hasProperty(parsedBody, 'token')) {
        return request;
    }

    return {
        ...request,
        body: UTF8.encode(JSON.stringify({...parsedBody, deviceId})),
    };
}

export class IdentityCreateTask implements LibthreemaTask<Promise<CreateIdentityResult>> {
    private readonly _log: Logger;
    private readonly _libthreemaTask: CreateIdentityTask;

    /**
     * Create a new libthreema identity-create task.
     *
     * @param _clientInfo Client info passed to libthreema.
     * @param _logging Logger factory.
     * @param configEnvironment The {@link ConfigEnvironment} that determines which server the
     *   identity is created against. Defaults to `{type: 'sandbox'}` for the consumer-sandbox test
     *   flow. The desktop standalone (OnPrem) flow passes `{type: 'on-prem', value: OnPremConfig}`
     *   built from the parsed OPPF (see `createOnPremConfigFromOppf` in `~/common/config`).
     * @param _flavor The application {@link Flavor}. Defaults to `{flavor: 'consumer'}` for the
     *   consumer-sandbox test flow. The desktop standalone (OnPrem) flow passes
     *   `{flavor: 'work', value: {credentials, flavor: 'on-prem'}}` so libthreema includes the
     *   activation credentials as `licenseUsername`/`licensePassword` in the create request (our
     *   OnPrem directory requires them in phase 2).
     * @param _deviceId Optional device id (hex string). When provided, it is injected into the
     *   create **phase-2** request body (our OnPrem directory requires it; libthreema-wasm never
     *   sends one). Omit for the consumer-sandbox test flow.
     */
    public constructor(
        private readonly _clientInfo: ClientInfo,
        private readonly _logging: LoggerFactory,
        configEnvironment: ConfigEnvironment = {type: 'sandbox'},
        private readonly _flavor: Flavor = {flavor: 'consumer'},
        private readonly _deviceId?: string,
    ) {
        this._log = this._logging.logger('libthreema.create-identity-task');

        this._libthreemaTask = CreateIdentityTask.new({
            clientInfo: _clientInfo,
            configEnvironment,
            flavor: _flavor,
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
                            // For the OnPrem standalone flow, splice the mandatory `deviceId` into
                            // the create phase-2 body (no-op for any other request, and a no-op when
                            // no `deviceId` was provided, e.g. the consumer-sandbox test flow).
                            const request =
                                this._deviceId === undefined
                                    ? instruction.value
                                    : injectDeviceIdIntoCreatePhase2(
                                          instruction.value,
                                          this._deviceId,
                                          this._log,
                                      );
                            const result = await doRequest(request, this._log);
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
                case 'error': {
                    // CRITICAL: must abort the poll loop. A bare `break` only exits the switch and
                    // re-enters `poll()`, which re-emits the same terminal error forever (observed:
                    // 'server-error' written hundreds of thousands of times, 200MB+ log). The task
                    // is terminal on error, so throw and let the caller surface it to the wizard.
                    const error = pollResult.value;
                    // The directory surfaces its `{success: false, error}` body through the wasm as a
                    // `server-error` whose `details` carry the (possibly localized) message, e.g.
                    // "...invalid or already redeemed license key". Preserve it so the caller can
                    // distinguish an already-redeemed activation key from a generic failure. Only some
                    // `CspE2eProtocolError` variants carry a string `details`; the rest are
                    // self-explanatory by their `type`.
                    const detailsSuffix = hasProperty(error, 'details')
                        ? ` (${String(error.details)})`
                        : '';
                    this._log.error(`Create identity task error: '${error.type}'${detailsSuffix}`);
                    throw new Error(`Identity creation failed: ${error.type}${detailsSuffix}`);
                }
                default:
                    unreachable(pollResult);
            }
        }
    }
}

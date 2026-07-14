import * as v from '@badrap/valita';
import type {
    ClientInfo,
    ConfigEnvironment,
    CreateIdentityResult,
    Flavor,
} from '@threema/libthreema-wasm';

import type {LoggerFactory} from '~/common/logging';
import {IdentityCreateTask} from '~/common/network/protocol/task/libthreema/identity-create';
import {
    ensureCspDeviceId,
    ensureD2mDeviceId,
    ensureDeviceCookie,
    ensureIdentityString,
    ensureServerGroup,
} from '~/common/network/types';
import {ensureU8} from '~/common/types';
import {assert} from '~/common/utils/assert';
import {bytesToHex, hexToBytes} from '~/common/utils/byte';

export const TEST_DATA_JSON_SCHEMA = v
    .object({
        profile: v.object({
            identity: v.string().map(ensureIdentityString),
            keyStoragePassword: v.string(),
            privateKey: v.string(),
        }),
        serverGroup: v.string().map(ensureServerGroup),
        deviceIds: v.object({
            d2mDeviceId: v.number().map(BigInt).map(ensureD2mDeviceId),
            cspDeviceId: v.number().map(BigInt).map(ensureCspDeviceId),
        }),
        deviceCookie: v.string().map(hexToBytes).map(ensureDeviceCookie),
        workData: v.object({username: v.string(), password: v.string()}).optional(),
        oppfUrl: v.string().optional(),
        oppFile: v.string().optional(),
    })
    .rest(v.unknown());

export type TestDataJson = Readonly<v.Infer<typeof TEST_DATA_JSON_SCHEMA>>;

export function parseTestData(data: string): TestDataJson {
    return TEST_DATA_JSON_SCHEMA.parse(JSON.parse(data));
}

/**
 * Run the libthreema {@link IdentityCreateTask} and return the freshly created identity.
 *
 * Shared, non-sandbox-gated helper used both by {@link generateTestData} (consumer-sandbox) and by
 * the desktop standalone bootstrap (`Backend.createFromStandaloneIdentity`, OnPrem). The caller is
 * responsible for any environment gating; this helper performs none.
 *
 * @param clientInfo Client info passed to libthreema.
 * @param logging Logger factory.
 * @param configEnvironment The {@link ConfigEnvironment} to create the identity against. Omit (or
 *   pass `undefined`) to use the consumer-sandbox default; pass `{type: 'on-prem', value}` built via
 *   `createOnPremConfigFromOppf` for the standalone OnPrem flow.
 * @param flavor The application {@link Flavor}. Omit (or pass `undefined`) to use the
 *   consumer-sandbox default `{flavor: 'consumer'}`; pass the work/on-prem flavor for the standalone
 *   OnPrem flow so libthreema includes the activation credentials in the create request.
 * @param deviceId Optional device id (hex string) injected into the create phase-2 request body for
 *   the OnPrem flow. Omit for the consumer-sandbox default.
 */
export async function runIdentityCreate(
    clientInfo: ClientInfo,
    logging: LoggerFactory,
    configEnvironment?: ConfigEnvironment,
    flavor?: Flavor,
    deviceId?: string,
): Promise<CreateIdentityResult> {
    const task = new IdentityCreateTask(clientInfo, logging, configEnvironment, flavor, deviceId);
    return await task.run();
}

export async function generateTestData(
    clientInfo: ClientInfo,
    logging: LoggerFactory,
): Promise<TestDataJson> {
    assert(
        import.meta.env.BUILD_FLAVOR === 'consumer-sandbox',
        'Test data generation is permitted only on consumer-sandbox.',
    );

    const identity = await runIdentityCreate(clientInfo, logging);

    const serverGroup = ensureServerGroup(
        bytesToHex(Uint8Array.of(ensureU8(identity.serverGroup))),
    );

    return {
        profile: {
            identity: ensureIdentityString(identity.userIdentity),
            keyStoragePassword: 'CHANGE_ME',
            privateKey: bytesToHex(identity.clientKey),
        },
        serverGroup,
        deviceIds: {
            d2mDeviceId: ensureD2mDeviceId(123n),
            cspDeviceId: ensureCspDeviceId(567n),
        },

        deviceCookie: ensureDeviceCookie(new Uint8Array(16)),
    };
}

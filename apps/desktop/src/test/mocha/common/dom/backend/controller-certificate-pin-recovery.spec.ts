import * as fs from 'node:fs';

import {RemoteSecretMonitorProtocol, type HttpsRequest} from '@threema/libthreema-wasm';
import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';
import {expect} from 'chai';
import {restore, stub} from 'sinon';

import {NACL_CONSTANTS} from '~/common/crypto';
import {DATABASE_KEY_LENGTH, wrapRawDatabaseKey} from '~/common/db';
import {BackendController} from '~/common/dom/backend/controller';
import type {IFrontendElectronService} from '~/common/electron-service';
import type {KeyStorageRemoteSecretWriteData, LatestKeyStorageLayers} from '~/common/key-storage';
import {NOOP_LOGGER} from '~/common/logging';
import {
    ensureBaseUrl,
    ensureCspDeviceId,
    ensureD2mDeviceId,
    ensureDeviceCookie,
    ensureIdentityString,
    ensureRemoteSecretAuthenticationToken,
    ensureRemoteSecretHash,
    ensureServerGroup,
    wrapRemoteSecret,
} from '~/common/network/types';
import {wrapRawClientKey, wrapRawDeviceGroupKey} from '~/common/network/types/keys';
import {FileSystemKeyStorage} from '~/common/node/key-storage';
import type {Remote} from '~/common/utils/endpoint';
import {
    makeTestFileSystemKeyStorage,
    makeTestServicesWithoutIdentity,
} from '~/test/mocha/common/backend-mocks';

type CreateWithCertificatePinRecovery = <T>(
    register: (waitForAppAttached: boolean) => void,
    create: () => Promise<T>,
) => Promise<T>;

const createWithCertificatePinRecovery = (
    BackendController as unknown as {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        readonly _createWithCertificatePinRecovery: CreateWithCertificatePinRecovery;
    }
)._createWithCertificatePinRecovery;

const PASSWORD = 'remote-secret-startup-password';

function makeInnerContents(
    services: ReturnType<typeof makeTestServicesWithoutIdentity>,
): LatestKeyStorageLayers['inner']['consumable'] {
    return {
        identityData: {
            identity: ensureIdentityString('00000001'),
            ck: wrapRawClientKey(
                services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
            ),
            serverGroup: ensureServerGroup('01'),
        },
        dgk: wrapRawDeviceGroupKey(
            services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
        ),
        databaseKey: wrapRawDatabaseKey(
            services.crypto.randomBytes(new Uint8Array(DATABASE_KEY_LENGTH)),
        ),
        deviceIds: {
            d2mDeviceId: ensureD2mDeviceId(1337n),
            cspDeviceId: ensureCspDeviceId(2448n),
        },
        deviceCookie: ensureDeviceCookie(new Uint8Array(16)),
    };
}

export function run(): void {
    describe('existing-profile certificate-pin recovery registration', function () {
        this.afterEach(function () {
            restore();
        });

        it('uses pre-attachment recovery until backend creation completes, then replaces it', async function () {
            const creation = new ResolvablePromise<string>({uncaught: 'default'});
            const registrations: boolean[] = [];
            const result = createWithCertificatePinRecovery(
                (waitForAppAttached) => {
                    registrations.push(waitForAppAttached);
                },
                async () => await creation,
            );

            expect(registrations).to.deep.equal([false]);
            creation.resolve('backend');

            expect(await result).to.equal('backend');
            expect(registrations).to.deep.equal([false, true]);
        });

        it('releases a real Remote-Secret-protected startup mismatch without app attachment', async function () {
            // eslint-disable-next-line turbo/no-undeclared-env-vars
            if (import.meta.env.BUILD_FLAVOR !== 'custom-onprem') {
                this.skip();
            }
            this.timeout(30_000);

            const baseServices = makeTestServicesWithoutIdentity();
            const restartReady = new ResolvablePromise<void>({uncaught: 'default'});
            const beforeRestartReleased = new ResolvablePromise<void>({uncaught: 'default'});
            const electron = {
                ...baseServices.electron,
                beforeRestart: async () => {
                    await restartReady;
                    beforeRestartReleased.resolve();
                },
                remoteSecretErrorRestartApp: async () => await Promise.resolve(),
            } as unknown as Remote<IFrontendElectronService>;
            const services = {...baseServices, electron};
            const details = makeTestFileSystemKeyStorage(services);
            const hadSelf = Reflect.has(globalThis, 'self');
            const previousSelf = Reflect.get(globalThis, 'self');
            Reflect.set(globalThis, 'self', globalThis);
            const remoteSecretWriteData: KeyStorageRemoteSecretWriteData = {
                endpoint: ensureBaseUrl('https://remote-secret.example/', 'https:'),
                hash: ensureRemoteSecretHash(new Uint8Array(32).fill(1)),
                token: ensureRemoteSecretAuthenticationToken(new Uint8Array(32).fill(2)),
                raw: wrapRemoteSecret(new Uint8Array(32).fill(3)),
            };

            try {
                await details.keyStorage.create(
                    PASSWORD,
                    {
                        inner: makeInnerContents(services),
                        intermediate: {
                            onPremConfig: undefined,
                            workCredentials: undefined,
                        },
                    },
                    remoteSecretWriteData,
                );

                const freshKeyStorage = new FileSystemKeyStorage(
                    services,
                    NOOP_LOGGER,
                    details.profileDirectoryPath,
                );
                const request: HttpsRequest = {
                    url: 'https://remote-secret.example/',
                    method: 'get',
                    headers: [],
                    body: new Uint8Array(),
                    timeoutMs: 1_000,
                };
                stub(RemoteSecretMonitorProtocol, 'new').returns({
                    poll: stub().returns({
                        type: 'instruction',
                        result: {type: 'request', value: request},
                    }),
                    response: stub().returns({type: 'invalid-response'}),
                } as unknown as RemoteSecretMonitorProtocol);

                let activeRecovery: (() => Promise<void>) | undefined;
                let observedWaitForAppAttached: boolean | undefined;
                let recoveryCompleted = false;
                const appAttached = new ResolvablePromise<void>({uncaught: 'default'});
                stub(globalThis, 'fetch').callsFake(async () => {
                    if (activeRecovery === undefined) {
                        throw new Error('Recovery callback was not registered');
                    }
                    await activeRecovery();
                    throw new Error('Certificate pin mismatch');
                });

                const startupOutcome = Promise.race([
                    createWithCertificatePinRecovery(
                        (waitForAppAttached) => {
                            activeRecovery = async () => {
                                observedWaitForAppAttached = waitForAppAttached;
                                if (waitForAppAttached) {
                                    await appAttached;
                                }
                                recoveryCompleted = true;
                                restartReady.resolve();
                            };
                        },
                        async () => await freshKeyStorage.init(PASSWORD),
                    ).then(() => 'completed' as const),
                    beforeRestartReleased.then(() => 'restart-ready' as const),
                ]);

                expect(await startupOutcome).to.equal('restart-ready');
                expect(observedWaitForAppAttached).to.be.false;
                expect(appAttached.done).to.be.false;
                expect(recoveryCompleted).to.be.true;
            } finally {
                if (hadSelf) {
                    Reflect.set(globalThis, 'self', previousSelf);
                } else {
                    Reflect.deleteProperty(globalThis, 'self');
                }
                fs.rmSync(details.profileDirectoryPath, {recursive: true, force: true});
            }
        });
    });
}

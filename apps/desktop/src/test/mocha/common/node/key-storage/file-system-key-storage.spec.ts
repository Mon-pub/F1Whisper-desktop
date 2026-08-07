import * as fs from 'node:fs';

import * as chai from 'chai';
import {stub} from 'sinon';

import {NACL_CONSTANTS} from '~/common/crypto';
import {DATABASE_KEY_LENGTH, wrapRawDatabaseKey} from '~/common/db';
import {
    InnerKeyStorageV1,
    InnerKeyStorageV2,
    InnerKeyStorage_Version,
    IntermediateKeyStorageV1,
    IntermediateKeyStorageV11,
    IntermediateKeyStorage_Version,
    OuterKeyStorageV1,
    OuterKeyStorageV2,
    OuterKeyStorage_Version,
} from '~/common/internal-protobuf/key-storage-file';
import type {LatestKeyStorageLayers, ServicesForKeyStorage} from '~/common/key-storage';
import {KeyStorageError} from '~/common/key-storage/common';
import {
    ARGON2_MIN_PARAMS,
    Argon2Version,
    type Argon2idParameters,
} from '~/common/key-storage/layers/outer/common';
import {NOOP_LOGGER} from '~/common/logging';
import {
    ensureCspDeviceId,
    ensureD2mDeviceId,
    ensureDeviceCookie,
    ensureIdentityString,
    ensureServerGroup,
} from '~/common/network/types';
import {wrapRawClientKey, wrapRawDeviceGroupKey} from '~/common/network/types/keys';
import {FileSystemKeyStorage} from '~/common/node/key-storage';
import {encryptPasswordBased} from '~/common/node/key-storage/crypto';
import {
    encodeAndEncryptLatestInnerKeyStorage,
    encodeAndEncryptLatestIntermediateKeyStorage,
    encodeLatestOuterKeyStorage,
} from '~/common/node/key-storage/helpers';
import {KiB, MiB, type ReadonlyUint8Array} from '~/common/types';
import {assertError} from '~/common/utils/assert';
import {byteJoin} from '~/common/utils/byte';
import {intoUnsignedLong, u16ToBytesLe} from '~/common/utils/number';
import chaiByteEqual from '~/test/common/plugins/byte-equal';
import {
    makeTestFileSystemKeyStorage,
    makeTestServicesWithoutIdentity,
} from '~/test/mocha/common/backend-mocks';

const {expect} = chai.use(chaiByteEqual);

const PASSWORD = 'incred1bly s3cur3!!11';
const WRONG_PASSWORD = 'not-the-password';

/**
 * Build the plaintext (consumable) contents of an inner key storage with randomized keys.
 */
function makeInnerContents(
    services: Pick<ServicesForKeyStorage, 'crypto'>,
): LatestKeyStorageLayers['inner']['consumable'] {
    const {crypto} = services;
    return {
        identityData: {
            identity: ensureIdentityString('00000001'),
            ck: wrapRawClientKey(crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH))),
            serverGroup: ensureServerGroup('01'),
        },
        dgk: wrapRawDeviceGroupKey(crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH))),
        databaseKey: wrapRawDatabaseKey(crypto.randomBytes(new Uint8Array(DATABASE_KEY_LENGTH))),
        deviceIds: {
            d2mDeviceId: ensureD2mDeviceId(1337n),
            cspDeviceId: ensureCspDeviceId(2448n),
        },
        deviceCookie: ensureDeviceCookie(new Uint8Array(16)),
    };
}

/**
 * Build the plaintext (consumable) contents of an intermediate key storage. In the consumer-sandbox
 * test build, work credentials and OnPrem config must be `undefined`.
 */
function makeIntermediateContents(): LatestKeyStorageLayers['intermediate']['consumable'] {
    return {workCredentials: undefined, onPremConfig: undefined};
}

/**
 * Argon2id parameters that are as cheap as possible while still passing validation. Suitable for
 * building fixture files quickly, not for tests that exercise the real `create()` path.
 */
function makeFastArgonParams(services: Pick<ServicesForKeyStorage, 'crypto'>): Argon2idParameters {
    return {
        version: Argon2Version.fromArgon2VersionByte(0x13),
        salt: services.crypto.randomBytes(new Uint8Array(ARGON2_MIN_PARAMS.accept.saltLengthBytes)),
        memoryBytes: 100 * KiB,
        iterations: ARGON2_MIN_PARAMS.accept.iterations,
        parallelism: ARGON2_MIN_PARAMS.accept.parallelism,
    };
}

/**
 * Build the raw file bytes of a valid latest-version key storage.
 */
async function buildLatestFileBytes(
    contents: {
        readonly inner: LatestKeyStorageLayers['inner']['consumable'];
        readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
    },
    password: string,
    argonParams: Argon2idParameters,
    services: ServicesForKeyStorage,
): Promise<LatestKeyStorageLayers['outer']['encoded']> {
    const intermediateInner = encodeAndEncryptLatestInnerKeyStorage(
        contents.inner,
        undefined,
        services,
    );
    const intermediate = await encodeAndEncryptLatestIntermediateKeyStorage(
        intermediateInner,
        contents.intermediate,
        {password, params: argonParams},
        services,
    );
    return encodeLatestOuterKeyStorage(intermediate, {
        kdfParameters: {$case: 'argon2id', argon2id: argonParams},
    });
}

/**
 * Build the raw file bytes of a deprecated v1 key storage file (outer v1 + inner v1, no
 * intermediate layer, no outer version prefix).
 */
async function buildDeprecatedV1FileBytes(
    innerContents: LatestKeyStorageLayers['inner']['consumable'],
    password: string,
    argonParams: Argon2idParameters,
    services: ServicesForKeyStorage,
): Promise<Uint8Array> {
    const inner: InnerKeyStorageV1 = {
        schemaVersion: 2,
        identityData: {
            identity: innerContents.identityData.identity,
            ck: innerContents.identityData.ck.unwrap(),
            serverGroup: innerContents.identityData.serverGroup,
        },
        dgk: innerContents.dgk.unwrap(),
        databaseKey: innerContents.databaseKey.unwrap(),
        deviceIds: {
            d2mDeviceId: intoUnsignedLong(innerContents.deviceIds.d2mDeviceId),
            cspDeviceId: intoUnsignedLong(innerContents.deviceIds.cspDeviceId),
        },
        deviceCookie: innerContents.deviceCookie as ReadonlyUint8Array as Uint8Array,
        workCredentials: undefined,
        onPremConfig: undefined,
    };
    const encodedInner = InnerKeyStorageV1.encode(inner).finish();
    const encryptedInner = (await encryptPasswordBased(
        encodedInner,
        {password, params: argonParams},
        services,
    )) as Uint8Array;

    return OuterKeyStorageV1.encode({
        schemaVersion: 1,
        encryptedKeyStorage: encryptedInner,
        kdfParameters: {
            $case: 'argon2id',
            argon2id: {
                version: argonParams.version.toProtobuf(),
                salt: argonParams.salt,
                memoryBytes: argonParams.memoryBytes,
                iterations: argonParams.iterations,
                parallelism: argonParams.parallelism,
            },
        },
    }).finish();
}

/**
 * Build the raw file bytes of a key storage file whose outer and intermediate layers are latest,
 * but whose inner layer is at `InnerKeyStorage_Version.V2_0`. Used to verify inner-layer migration.
 */
async function buildFileBytesWithInnerV2(
    innerContents: LatestKeyStorageLayers['inner']['consumable'],
    password: string,
    argonParams: Argon2idParameters,
    services: ServicesForKeyStorage,
): Promise<LatestKeyStorageLayers['outer']['encoded']> {
    // Build inner v2 (workCredentials/onPremConfig live here in this version).
    const innerV2: InnerKeyStorageV2 = {
        identityData: {
            identity: innerContents.identityData.identity,
            ck: innerContents.identityData.ck.unwrap(),
            serverGroup: innerContents.identityData.serverGroup,
        },
        dgk: innerContents.dgk.unwrap(),
        databaseKey: innerContents.databaseKey.unwrap(),
        deviceIds: {
            d2mDeviceId: intoUnsignedLong(innerContents.deviceIds.d2mDeviceId),
            cspDeviceId: intoUnsignedLong(innerContents.deviceIds.cspDeviceId),
        },
        deviceCookie: innerContents.deviceCookie as ReadonlyUint8Array as Uint8Array,
        workCredentials: undefined,
        onPremConfig: undefined,
    };
    const encodedInnerV2 = byteJoin(
        u16ToBytesLe(InnerKeyStorage_Version.V2_0),
        InnerKeyStorageV2.encode(innerV2).finish(),
    );

    // Wrap in intermediate v1.1 (latest).
    const intermediateEncoded = byteJoin(
        u16ToBytesLe(IntermediateKeyStorage_Version.V1_1),
        IntermediateKeyStorageV11.encode({
            inner: {$case: 'plaintextInner', plaintextInner: encodedInnerV2},
            workCredentials: undefined,
            onPremConfig: undefined,
        }).finish(),
    );
    const encryptedIntermediate = (await encryptPasswordBased(
        intermediateEncoded,
        {password, params: argonParams},
        services,
    )) as Uint8Array;

    // Wrap in outer v2 (latest).
    return byteJoin(
        u16ToBytesLe(OuterKeyStorage_Version.V2_0),
        OuterKeyStorageV2.encode({
            encryptedIntermediate,
            kdfParameters: {
                $case: 'argon2id',
                argon2id: {
                    version: argonParams.version.toProtobuf(),
                    salt: argonParams.salt,
                    memoryBytes: argonParams.memoryBytes,
                    iterations: argonParams.iterations,
                    parallelism: argonParams.parallelism,
                },
            },
        }).finish(),
    ) as LatestKeyStorageLayers['outer']['encoded'];
}

/**
 * Build the raw file bytes of a key storage file whose outer and inner layers are latest, but whose
 * intermediate layer is at `IntermediateKeyStorage_Version.V1_0`. Used to verify intermediate-layer
 * migration.
 */
async function buildFileBytesWithIntermediateV1(
    innerContents: LatestKeyStorageLayers['inner']['consumable'],
    password: string,
    argonParams: Argon2idParameters,
    services: ServicesForKeyStorage,
): Promise<LatestKeyStorageLayers['outer']['encoded']> {
    // Build inner v3 (latest). Note: v3 doesn't carry workCredentials/OnPremConfig, and
    // intermediate v1.0 doesn't either, so those fields will simply be absent after migration.
    const intermediateInnerV3 = encodeAndEncryptLatestInnerKeyStorage(
        innerContents,
        undefined,
        services,
    );
    if (intermediateInnerV3.$case !== 'plaintextInner') {
        throw new Error('Expected plaintextInner');
    }

    // Wrap in intermediate v1.0 (deprecated). Re-construct to avoid the v1.1 vs v1 schema branding
    // mismatch.
    const intermediateEncoded = byteJoin(
        u16ToBytesLe(IntermediateKeyStorage_Version.V1_0),
        IntermediateKeyStorageV1.encode({
            inner: {
                $case: 'plaintextInner',
                plaintextInner: intermediateInnerV3.plaintextInner,
            },
        }).finish(),
    );
    const encryptedIntermediate = (await encryptPasswordBased(
        intermediateEncoded,
        {password, params: argonParams},
        services,
    )) as Uint8Array;

    // Wrap in outer v2 (latest).
    return byteJoin(
        u16ToBytesLe(OuterKeyStorage_Version.V2_0),
        OuterKeyStorageV2.encode({
            encryptedIntermediate,
            kdfParameters: {
                $case: 'argon2id',
                argon2id: {
                    version: argonParams.version.toProtobuf(),
                    salt: argonParams.salt,
                    memoryBytes: argonParams.memoryBytes,
                    iterations: argonParams.iterations,
                    parallelism: argonParams.parallelism,
                },
            },
        }).finish(),
    ) as LatestKeyStorageLayers['outer']['encoded'];
}

type KeyStorageErrorType = KeyStorageError['type'];

/**
 * Assert that calling `fn` throws a {@link KeyStorageError} of the expected type.
 */
async function expectKeyStorageError(
    fn: () => Promise<unknown>,
    type: KeyStorageErrorType,
): Promise<void> {
    let thrown: unknown;
    try {
        await fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown, 'Expected a KeyStorageError to be thrown').to.be.instanceOf(KeyStorageError);
    assertError(thrown, KeyStorageError);
    expect(thrown.type, thrown.message).to.equal(type);
}

/**
 * Key storage tests.
 */
export function run(): void {
    const services = makeTestServicesWithoutIdentity();

    describe('FileSystemKeyStorage', function () {
        let keyStorage: FileSystemKeyStorage;
        let keyStoragePath: string;
        let deprecatedKeyStoragePath: string;
        let profileDirectoryPath: string;

        // Shared fixtures, precomputed once to keep tests fast (KDF with minimal params still takes
        // ~100 ms per derivation).
        let fastArgonParams: Argon2idParameters;
        let baselineInner: LatestKeyStorageLayers['inner']['consumable'];
        let baselineIntermediate: LatestKeyStorageLayers['intermediate']['consumable'];
        let baselineFileBytes: LatestKeyStorageLayers['outer']['encoded'];

        this.beforeAll(async function () {
            this.timeout(10_000);

            fastArgonParams = makeFastArgonParams(services);
            baselineInner = makeInnerContents(services);
            baselineIntermediate = makeIntermediateContents();
            baselineFileBytes = await buildLatestFileBytes(
                {inner: baselineInner, intermediate: baselineIntermediate},
                PASSWORD,
                fastArgonParams,
                services,
            );
        });

        this.beforeEach(function () {
            const details = makeTestFileSystemKeyStorage(services);
            keyStorage = details.keyStorage;
            keyStoragePath = details.keyStoragePath;
            deprecatedKeyStoragePath = details.deprecatedKeyStoragePath;
            profileDirectoryPath = details.profileDirectoryPath;
        });

        this.afterEach(function () {
            fs.rmSync(profileDirectoryPath, {recursive: true, force: true});
        });

        /**
         * Write the shared baseline file bytes to the current instance's key storage path, then
         * call `init(PASSWORD)`. Most tests use this to get a fast, clean initialized state.
         */
        async function initWithBaseline(): Promise<void> {
            fs.writeFileSync(keyStoragePath, baselineFileBytes);
            await keyStorage.init(PASSWORD);
        }

        describe('before initialization', function () {
            it('throws not-initialized when reading isRemoteSecretEncrypted', function () {
                expect(() => keyStorage.isRemoteSecretEncrypted)
                    .to.throw(KeyStorageError)
                    .with.property('type', 'not-initialized');
            });

            it('throws not-initialized from readContents', async function () {
                await expectKeyStorageError(
                    async () => await keyStorage.readContents(PASSWORD),
                    'not-initialized',
                );
            });

            it('authenticates and reads only the intermediate layer before initialization', async function () {
                fs.writeFileSync(keyStoragePath, baselineFileBytes);

                const intermediate = await keyStorage.readIntermediateContents(PASSWORD);

                expect(intermediate).to.deep.equal({
                    ...baselineIntermediate,
                    isInnerRemoteSecretProtected: false,
                });
                expect(() => keyStorage.isRemoteSecretEncrypted).to.throw(KeyStorageError);
            });

            it('rejects the wrong password when reading the intermediate layer', async function () {
                fs.writeFileSync(keyStoragePath, baselineFileBytes);
                await expectKeyStorageError(
                    async () => await keyStorage.readIntermediateContents(WRONG_PASSWORD),
                    'undecryptable',
                );
            });

            it('throws not-initialized from setPassword', async function () {
                await expectKeyStorageError(
                    async () => await keyStorage.setPassword(PASSWORD, 'new'),
                    'not-initialized',
                );
            });

            it('atomically stages OnPrem config without decrypting the inner layer', async function () {
                fs.writeFileSync(keyStoragePath, baselineFileBytes);
                const staged =
                    // eslint-disable-next-line turbo/no-undeclared-env-vars
                    import.meta.env.BUILD_ENVIRONMENT === 'onprem'
                        ? {
                              oppfUrl: 'https://oppf.example/config.oppf',
                              oppfCachedConfig: '{}',
                              oppfCachedConfigIsFallback: true,
                              lastUpdated: BigInt(Date.now()),
                          }
                        : undefined;

                await keyStorage.setOnPremConfig(PASSWORD, staged);

                expect(
                    (await keyStorage.readIntermediateContents(PASSWORD)).onPremConfig,
                ).to.deep.equal(staged);
                const {inner} = await keyStorage.init(PASSWORD);
                expect(inner.identityData.identity).to.equal(baselineInner.identityData.identity);
            });

            it('throws not-initialized from setRemoteSecret', async function () {
                await expectKeyStorageError(
                    async () => await keyStorage.setRemoteSecret(PASSWORD, undefined),
                    'not-initialized',
                );
            });

            it('throws not-initialized from setWorkCredentials', async function () {
                await expectKeyStorageError(
                    async () =>
                        await keyStorage.setWorkCredentials(PASSWORD, {
                            username: 'u',
                            password: 'p',
                        }),
                    'not-initialized',
                );
            });
        });

        describe('constructor', function () {
            it('throws not-found if the parent directory does not exist', function () {
                expect(
                    () =>
                        new FileSystemKeyStorage(services, NOOP_LOGGER, '/does/not/exist/for/sure'),
                )
                    .to.throw(KeyStorageError)
                    .with.property('type', 'not-found');
            });
        });

        describe('create()', function () {
            // `create()` runs the KDF benchmark (`determineKdfParams`) which spends ~2s on argon2;
            // give the suite headroom.
            this.timeout(30_000);

            it('writes a valid key storage file to disk', async function () {
                expect(fs.existsSync(keyStoragePath)).to.be.false;
                await keyStorage.create(
                    PASSWORD,
                    {inner: makeInnerContents(services), intermediate: makeIntermediateContents()},
                    undefined,
                );
                expect(fs.existsSync(keyStoragePath)).to.be.true;
                expect(fs.statSync(keyStoragePath).size).to.be.greaterThan(0);
            });

            it('throws internal-error if the key storage file already exists', async function () {
                fs.writeFileSync(keyStoragePath, baselineFileBytes);
                await expectKeyStorageError(
                    async () =>
                        await keyStorage.create(
                            PASSWORD,
                            {
                                inner: makeInnerContents(services),
                                intermediate: makeIntermediateContents(),
                            },
                            undefined,
                        ),
                    'internal-error',
                );
            });

            it('produces a file that a fresh instance can init() and read back', async function () {
                const inner = makeInnerContents(services);
                const intermediate = makeIntermediateContents();
                await keyStorage.create(PASSWORD, {inner, intermediate}, undefined);

                const fresh = new FileSystemKeyStorage(services, NOOP_LOGGER, profileDirectoryPath);
                const read = await fresh.init(PASSWORD);

                expect(read.inner.identityData.identity).to.equal(inner.identityData.identity);
                expect(read.inner.identityData.ck.unwrap()).to.byteEqual(
                    inner.identityData.ck.unwrap(),
                );
                expect(read.inner.dgk.unwrap()).to.byteEqual(inner.dgk.unwrap());
                expect(read.inner.databaseKey.unwrap()).to.byteEqual(inner.databaseKey.unwrap());
                expect(read.inner.deviceIds.d2mDeviceId).to.equal(inner.deviceIds.d2mDeviceId);
                expect(read.inner.deviceIds.cspDeviceId).to.equal(inner.deviceIds.cspDeviceId);
                expect(read.inner.deviceCookie).to.byteEqual(
                    inner.deviceCookie as ReadonlyUint8Array as Uint8Array,
                );
            });

            it('marks the instance as initialized (stores accessible after create)', async function () {
                await keyStorage.create(
                    PASSWORD,
                    {inner: makeInnerContents(services), intermediate: makeIntermediateContents()},
                    undefined,
                );
                expect(keyStorage.isRemoteSecretEncrypted).to.be.false;
            });
        });

        describe('init()', function () {
            describe('error cases', function () {
                it('throws not-found when no key storage file is present', async function () {
                    await expectKeyStorageError(
                        async () => await keyStorage.init(PASSWORD),
                        'not-found',
                    );
                });

                it('throws not-readable when the key storage path is a directory', async function () {
                    fs.mkdirSync(keyStoragePath);
                    await expectKeyStorageError(
                        async () => await keyStorage.init(PASSWORD),
                        'not-readable',
                    );
                });

                it('throws malformed when the key storage file is empty', async function () {
                    fs.writeFileSync(keyStoragePath, new Uint8Array(0));
                    await expectKeyStorageError(
                        async () => await keyStorage.init(PASSWORD),
                        'malformed',
                    );
                });

                it('throws malformed when the outer version prefix is not V2_0', async function () {
                    // Prepend an unknown u16-le version (e.g. 0xFFFF) to otherwise-valid bytes.
                    const tampered = new Uint8Array(baselineFileBytes.byteLength);
                    tampered.set(baselineFileBytes);
                    tampered[0] = 0xff;
                    tampered[1] = 0xff;
                    fs.writeFileSync(keyStoragePath, tampered);
                    await expectKeyStorageError(
                        async () => await keyStorage.init(PASSWORD),
                        'malformed',
                    );
                });

                it('throws malformed when the protobuf bytes are garbage', async function () {
                    // Correct V2_0 version prefix, garbage protobuf payload.
                    const garbage = byteJoin(
                        u16ToBytesLe(OuterKeyStorage_Version.V2_0),
                        new Uint8Array([0x42, 0x42, 0x42, 0x42, 0x42]),
                    );
                    fs.writeFileSync(keyStoragePath, garbage);
                    await expectKeyStorageError(
                        async () => await keyStorage.init(PASSWORD),
                        'malformed',
                    );
                });

                it('throws undecryptable when the password is wrong', async function () {
                    fs.writeFileSync(keyStoragePath, baselineFileBytes);
                    await expectKeyStorageError(
                        async () => await keyStorage.init(WRONG_PASSWORD),
                        'undecryptable',
                    );
                });

                it('throws undecryptable when the ciphertext has been tampered with', async function () {
                    // Flip a byte in the middle of the encrypted intermediate. Since the last few
                    // bytes of the file are the KDF parameters, the middle is part of the encrypted
                    // blob.
                    const tampered = new Uint8Array(baselineFileBytes.byteLength);
                    tampered.set(baselineFileBytes);
                    const idx = Math.floor(tampered.byteLength / 2);
                    // eslint-disable-next-line no-bitwise
                    tampered[idx] = (tampered[idx] ?? 0) ^ 0xff;
                    fs.writeFileSync(keyStoragePath, tampered);
                    await expectKeyStorageError(
                        async () => await keyStorage.init(PASSWORD),
                        'undecryptable',
                    );
                });
            });

            describe('success cases', function () {
                it('reads a valid latest-version file and returns its contents', async function () {
                    fs.writeFileSync(keyStoragePath, baselineFileBytes);
                    const {inner, intermediate} = await keyStorage.init(PASSWORD);

                    expect(inner.identityData.identity).to.equal(
                        baselineInner.identityData.identity,
                    );
                    expect(inner.identityData.ck.unwrap()).to.byteEqual(
                        baselineInner.identityData.ck.unwrap(),
                    );
                    expect(inner.dgk.unwrap()).to.byteEqual(baselineInner.dgk.unwrap());
                    expect(inner.databaseKey.unwrap()).to.byteEqual(
                        baselineInner.databaseKey.unwrap(),
                    );
                    expect(inner.deviceIds.d2mDeviceId).to.equal(
                        baselineInner.deviceIds.d2mDeviceId,
                    );
                    expect(inner.deviceIds.cspDeviceId).to.equal(
                        baselineInner.deviceIds.cspDeviceId,
                    );
                    expect(inner.deviceCookie).to.byteEqual(
                        baselineInner.deviceCookie as ReadonlyUint8Array as Uint8Array,
                    );

                    expect(intermediate.workCredentials).to.be.undefined;
                    expect(intermediate.onPremConfig).to.be.undefined;
                });

                it('does not re-write the file when all layers are already at latest', async function () {
                    fs.writeFileSync(keyStoragePath, baselineFileBytes);
                    const beforeBytes = fs.readFileSync(keyStoragePath);
                    await keyStorage.init(PASSWORD);
                    const afterBytes = fs.readFileSync(keyStoragePath);
                    expect(afterBytes).to.byteEqual(beforeBytes);
                });

                it('marks the instance as initialized', async function () {
                    await initWithBaseline();
                    // Accessing `isRemoteSecretEncrypted` post-init must no longer throw.
                    expect(keyStorage.isRemoteSecretEncrypted).to.be.false;
                });
            });
        });

        describe('init() onIntermediateDecoded callback ordering (FU-H03 regression guard)', function () {
            // Backend.createFromKeyStorage's `resolveOppfAndPinBeforeInnerDecrypt` callback (see
            // `~/common/dom/backend`) relies on `init()` awaiting `onIntermediateDecoded` BEFORE
            // proceeding to process the inner layer -- for a Remote-Secret-protected inner, that
            // inner-processing step fetches the Remote Secret over the same default Electron session
            // the callback installs pins on (FU-H03). These tests exercise that ordering through the
            // REAL `init()` path (not a direct call to the extracted callback logic, which the
            // dedicated FU-H03 bootstrap-ordering suite already covers in isolation).
            //
            // Scope note: these use the baseline fixture's PLAINTEXT inner. `migration.ts`'s real
            // source (verified by reading it, not assumed) invokes `onIntermediateDecoded`
            // unconditionally, strictly before the `switch` that decides whether to decrypt inner as
            // plaintext or via `RemoteSecretApplicationStartMonitorTask` -- the callback's position in
            // that control flow is identical for both cases, so a plaintext fixture exercises the same
            // ordering-risk code path. What this does NOT cover: proving strict pre-decrypt TIMING
            // against a Remote-Secret-protected inner specifically, because decrypting a plaintext
            // inner is a synchronous property read with no async boundary to race against. Actually
            // exercising the Remote-Secret branch requires `RemoteSecretApplicationStartMonitorTask`,
            // which depends on `RemoteSecretMonitorProtocol` from the native `@threema/libthreema-wasm`
            // module -- mocking that native protocol state machine is out of scope for this guard;
            // logged as an accepted gap rather than attempted.

            it('propagates a callback error instead of silently returning inner contents (guards against the callback becoming fire-and-forget or skipped)', async function () {
                fs.writeFileSync(keyStoragePath, baselineFileBytes);
                const marker = new Error('FU-H03 regression-guard: intentional callback failure');

                let caught: unknown;
                try {
                    await keyStorage.init(
                        PASSWORD,
                        // The callback contract is async; throwing is the behavior under test.
                        // eslint-disable-next-line @typescript-eslint/require-await
                        async () => {
                            throw marker;
                        },
                    );
                } catch (error) {
                    caught = error;
                }

                expect(
                    caught,
                    'init() must propagate the callback error rather than resolving with inner contents -- a fire-and-forget (unawaited) callback would let init() succeed despite the throw',
                ).to.equal(marker);
                expect(
                    () => keyStorage.isRemoteSecretEncrypted,
                    'a rejected init() must not mark the instance initialized',
                ).to.throw(KeyStorageError);
            });

            it('invokes the callback with the correctly-decoded, non-stale intermediate data before init() resolves', async function () {
                fs.writeFileSync(keyStoragePath, baselineFileBytes);
                let callbackRan = false;
                let observedIsInnerRemoteSecretProtected: boolean | undefined;

                const {inner} = await keyStorage.init(
                    PASSWORD,
                    // The callback contract is async, but these ordering assertions are synchronous.
                    // eslint-disable-next-line @typescript-eslint/require-await
                    async ({intermediate, isInnerRemoteSecretProtected}) => {
                        callbackRan = true;
                        observedIsInnerRemoteSecretProtected = isInnerRemoteSecretProtected;
                        expect(intermediate.workCredentials).to.be.undefined;
                        expect(intermediate.onPremConfig).to.be.undefined;
                    },
                );

                expect(callbackRan, 'the callback must run as part of init()').to.be.true;
                expect(
                    observedIsInnerRemoteSecretProtected,
                    'the baseline fixture has a plaintext inner',
                ).to.be.false;
                expect(inner.identityData.identity).to.equal(baselineInner.identityData.identity);
            });
        });

        describe('readForRestoration()', function () {
            it('reads current contents without initializing or rewriting the archive', async function () {
                fs.writeFileSync(keyStoragePath, baselineFileBytes);
                const beforeBytes = fs.readFileSync(keyStoragePath);

                const {inner} = await keyStorage.readForRestoration(PASSWORD);

                expect(inner.databaseKey.unwrap()).to.byteEqual(baselineInner.databaseKey.unwrap());
                expect(fs.readFileSync(keyStoragePath)).to.byteEqual(beforeBytes);
                expect(() => keyStorage.isRemoteSecretEncrypted).to.throw(KeyStorageError);
            });

            it('decodes a required migration without invoking the atomic writer', async function () {
                const bytes = await buildFileBytesWithInnerV2(
                    baselineInner,
                    PASSWORD,
                    fastArgonParams,
                    services,
                );
                fs.writeFileSync(keyStoragePath, bytes);
                const beforeBytes = fs.readFileSync(keyStoragePath);
                const writer = stub(
                    keyStorage as unknown as {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        _writeOrOverrideFile: (bytes: Uint8Array) => Promise<void>;
                    },
                    '_writeOrOverrideFile',
                ).rejects(new Error('atomic writer unavailable'));

                try {
                    const {inner} = await keyStorage.readForRestoration(PASSWORD);
                    expect(inner.databaseKey.unwrap()).to.byteEqual(
                        baselineInner.databaseKey.unwrap(),
                    );
                } finally {
                    writer.restore();
                }

                expect(writer.called).to.be.false;
                expect(fs.readFileSync(keyStoragePath)).to.byteEqual(beforeBytes);
            });

            it('reads a deprecated file without creating a replacement or deleting the source', async function () {
                const legacyBytes = await buildDeprecatedV1FileBytes(
                    baselineInner,
                    PASSWORD,
                    fastArgonParams,
                    services,
                );
                fs.writeFileSync(deprecatedKeyStoragePath, legacyBytes);

                const {inner} = await keyStorage.readForRestoration(PASSWORD);

                expect(inner.databaseKey.unwrap()).to.byteEqual(baselineInner.databaseKey.unwrap());
                expect(fs.existsSync(deprecatedKeyStoragePath)).to.be.true;
                expect(fs.readFileSync(deprecatedKeyStoragePath)).to.byteEqual(legacyBytes);
                expect(fs.existsSync(keyStoragePath)).to.be.false;
            });

            it('rejects excessive aggregate KDF work before decrypting', async function () {
                const decoded = OuterKeyStorageV2.decode(baselineFileBytes.subarray(2));
                if (decoded.kdfParameters?.$case !== 'argon2id') {
                    throw new Error('Expected Argon2id KDF parameters');
                }
                const tampered = byteJoin(
                    u16ToBytesLe(OuterKeyStorage_Version.V2_0),
                    OuterKeyStorageV2.encode({
                        ...decoded,
                        kdfParameters: {
                            $case: 'argon2id',
                            argon2id: {
                                ...decoded.kdfParameters.argon2id,
                                memoryBytes: 512 * MiB,
                                iterations: 9,
                            },
                        },
                    }).finish(),
                );
                fs.writeFileSync(keyStoragePath, tampered);

                await expectKeyStorageError(
                    async () => await keyStorage.readForRestoration(PASSWORD),
                    'invalid',
                );
            });
        });

        describe('migration', function () {
            it('migrates a deprecated v1 key storage file and deletes the legacy file', async function () {
                // Arrange: Write a legacy v1 file to the deprecated path.
                const legacyBytes = await buildDeprecatedV1FileBytes(
                    baselineInner,
                    PASSWORD,
                    fastArgonParams,
                    services,
                );
                fs.writeFileSync(deprecatedKeyStoragePath, legacyBytes);
                expect(fs.existsSync(keyStoragePath)).to.be.false;
                expect(fs.existsSync(deprecatedKeyStoragePath)).to.be.true;

                // Act.
                const {inner} = await keyStorage.init(PASSWORD);

                // Assert: Contents correct.
                expect(inner.identityData.identity).to.equal(baselineInner.identityData.identity);
                expect(inner.databaseKey.unwrap()).to.byteEqual(baselineInner.databaseKey.unwrap());
                expect(inner.dgk.unwrap()).to.byteEqual(baselineInner.dgk.unwrap());

                // Assert: Deprecated file deleted, new file written.
                expect(fs.existsSync(deprecatedKeyStoragePath)).to.be.false;
                expect(fs.existsSync(keyStoragePath)).to.be.true;

                // Assert: New file can be read by a fresh instance.
                const fresh = new FileSystemKeyStorage(services, NOOP_LOGGER, profileDirectoryPath);
                const reread = await fresh.init(PASSWORD);
                expect(reread.inner.databaseKey.unwrap()).to.byteEqual(
                    baselineInner.databaseKey.unwrap(),
                );
            });

            it('migrates intermediate v1.0 → v1.1 and re-writes the file', async function () {
                const bytes = await buildFileBytesWithIntermediateV1(
                    baselineInner,
                    PASSWORD,
                    fastArgonParams,
                    services,
                );
                fs.writeFileSync(keyStoragePath, bytes);
                const beforeBytes = fs.readFileSync(keyStoragePath);

                const {inner} = await keyStorage.init(PASSWORD);

                expect(inner.databaseKey.unwrap()).to.byteEqual(baselineInner.databaseKey.unwrap());

                // File should have been re-written (different ciphertext / intermediate version).
                const afterBytes = fs.readFileSync(keyStoragePath);
                expect(afterBytes).to.not.byteEqual(beforeBytes);

                // Re-read using a fresh instance to ensure the migrated file is valid.
                const fresh = new FileSystemKeyStorage(services, NOOP_LOGGER, profileDirectoryPath);
                await fresh.init(PASSWORD);
            });

            it('migrates inner v2.0 → v3.0 and re-writes the file', async function () {
                const bytes = await buildFileBytesWithInnerV2(
                    baselineInner,
                    PASSWORD,
                    fastArgonParams,
                    services,
                );
                fs.writeFileSync(keyStoragePath, bytes);
                const beforeBytes = fs.readFileSync(keyStoragePath);

                const {inner} = await keyStorage.init(PASSWORD);

                expect(inner.databaseKey.unwrap()).to.byteEqual(baselineInner.databaseKey.unwrap());
                expect(inner.identityData.identity).to.equal(baselineInner.identityData.identity);

                // File should have been re-written.
                const afterBytes = fs.readFileSync(keyStoragePath);
                expect(afterBytes).to.not.byteEqual(beforeBytes);

                // Re-read using a fresh instance to ensure the migrated file is valid.
                const fresh = new FileSystemKeyStorage(services, NOOP_LOGGER, profileDirectoryPath);
                await fresh.init(PASSWORD);
            });
        });

        describe('readContents()', function () {
            it('returns the stored contents when called after init', async function () {
                await initWithBaseline();

                const {inner, intermediate} = await keyStorage.readContents(PASSWORD);

                expect(inner.identityData.identity).to.equal(baselineInner.identityData.identity);
                expect(inner.dgk.unwrap()).to.byteEqual(baselineInner.dgk.unwrap());
                expect(inner.databaseKey.unwrap()).to.byteEqual(baselineInner.databaseKey.unwrap());
                expect(intermediate.workCredentials).to.be.undefined;
                expect(intermediate.onPremConfig).to.be.undefined;
            });

            it('throws undecryptable when called with the wrong password', async function () {
                await initWithBaseline();
                await expectKeyStorageError(
                    async () => await keyStorage.readContents(WRONG_PASSWORD),
                    'undecryptable',
                );
            });
        });

        describe('readIntermediateContents()', function () {
            it('returns intermediate contents when called after init', async function () {
                await initWithBaseline();
                const intermediate = await keyStorage.readIntermediateContents(PASSWORD);
                expect(intermediate.workCredentials).to.be.undefined;
                expect(intermediate.onPremConfig).to.be.undefined;
            });

            it('throws undecryptable when called with the wrong password', async function () {
                await initWithBaseline();
                await expectKeyStorageError(
                    async () => await keyStorage.readIntermediateContents(WRONG_PASSWORD),
                    'undecryptable',
                );
            });
        });

        describe('setPassword()', function () {
            it('re-encrypts the file so that the new password works on a fresh instance', async function () {
                await initWithBaseline();
                const newPassword = 'new-s3cur3-password!!';

                await keyStorage.setPassword(PASSWORD, newPassword);

                const fresh = new FileSystemKeyStorage(services, NOOP_LOGGER, profileDirectoryPath);
                const {inner} = await fresh.init(newPassword);
                expect(inner.databaseKey.unwrap()).to.byteEqual(baselineInner.databaseKey.unwrap());
            });

            it('makes the old password no longer work', async function () {
                await initWithBaseline();
                const newPassword = 'new-s3cur3-password!!';

                await keyStorage.setPassword(PASSWORD, newPassword);

                const fresh = new FileSystemKeyStorage(services, NOOP_LOGGER, profileDirectoryPath);
                await expectKeyStorageError(
                    async () => await fresh.init(PASSWORD),
                    'undecryptable',
                );
            });

            it('throws undecryptable when the current password is wrong', async function () {
                await initWithBaseline();
                await expectKeyStorageError(
                    async () => await keyStorage.setPassword(WRONG_PASSWORD, 'whatever'),
                    'undecryptable',
                );
            });

            it('retains a recoverable backup copy when overwriting the file (P-M08)', async function () {
                await initWithBaseline();
                const backupPath = `${keyStoragePath}.bak`;
                expect(fs.existsSync(backupPath), 'no backup before an overwrite').to.be.false;

                const newPassword = 'new-s3cur3-password!!';
                await keyStorage.setPassword(PASSWORD, newPassword);

                // The crash-safe overwrite retained a recoverable previous copy, and the atomically
                // written new file is fully valid for a fresh instance.
                expect(fs.existsSync(backupPath), 'backup retained after overwrite').to.be.true;
                const fresh = new FileSystemKeyStorage(services, NOOP_LOGGER, profileDirectoryPath);
                const {inner} = await fresh.init(newPassword);
                expect(inner.databaseKey.unwrap()).to.byteEqual(baselineInner.databaseKey.unwrap());
            });
        });

        describe('build flavor guards (consumer-sandbox)', function () {
            // In the consumer-sandbox build used by the mocha test runner, OnPrem config, Remote
            // Secret, and Work credentials are all unsupported. These tests capture the current
            // behavior of the guards.

            it('isRemoteSecretEncrypted returns false', async function () {
                if (process.env.TURBO_BUILD_VARIANT !== 'consumer') {
                    this.skip();
                }

                await initWithBaseline();
                expect(keyStorage.isRemoteSecretEncrypted).to.be.false;
            });

            it('onPremConfigStore getter throws internal-error', async function () {
                if (process.env.TURBO_BUILD_VARIANT !== 'consumer') {
                    this.skip();
                }

                await initWithBaseline();
                expect(() => keyStorage.onPremConfigStore)
                    .to.throw(KeyStorageError)
                    .with.property('type', 'internal-error');
            });

            it('remoteSecretDataStore getter throws internal-error', async function () {
                if (process.env.TURBO_BUILD_VARIANT !== 'consumer') {
                    this.skip();
                }

                await initWithBaseline();
                expect(() => keyStorage.remoteSecretDataStore)
                    .to.throw(KeyStorageError)
                    .with.property('type', 'internal-error');
            });

            it('workCredentialsStore getter throws', async function () {
                if (process.env.TURBO_BUILD_VARIANT !== 'consumer') {
                    this.skip();
                }

                await initWithBaseline();
                expect(() => keyStorage.workCredentialsStore).to.throw();
            });
        });
    });
}

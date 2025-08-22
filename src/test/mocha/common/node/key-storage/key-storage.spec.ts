import * as fs from 'node:fs';

import * as chai from 'chai';

import {NACL_CONSTANTS, NONCE_UNGUARDED_SCOPE, type PlainData, type RawKey} from '~/common/crypto';
import {CREATE_BUFFER_TOKEN} from '~/common/crypto/box';
import {DATABASE_KEY_LENGTH, wrapRawDatabaseKey} from '~/common/db';
import {
    InnerKeyStorageV1,
    InnerKeyStorageV2,
    InnerKeyStorageV2_InnerVersion,
    IntermediateKeyStorageV1,
    IntermediateKeyStorageV1_IntermediateVersion,
    OuterKeyStorageV1,
    OuterKeyStorageV2,
    OuterKeyStorageV2_Argon2idParameters_Argon2Version,
    OuterKeyStorageV2_OuterVersion,
    type OuterKeyStorageV1_Argon2idParameters_Argon2Version,
} from '~/common/internal-protobuf/key-storage-file';
import {
    ARGON2_MIN_PARAMS,
    type Argon2idParameters,
    Argon2Version,
    type InnerKeyStorageFileContentsV2,
    KeyStorageError,
    type KeyStorageErrorType,
    OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V2,
} from '~/common/key-storage';
import {
    ensureCspDeviceId,
    ensureD2mDeviceId,
    ensureDeviceCookie,
    ensureIdentityString,
    ensureServerGroup,
} from '~/common/network/types';
import {wrapRawClientKey, wrapRawDeviceGroupKey} from '~/common/network/types/keys';
import type {FileSystemKeyStorage} from '~/common/node/key-storage';
import {MiB, type ReadonlyUint8Array} from '~/common/types';
import {assert, assertError} from '~/common/utils/assert';
import {byteJoin, bytesToHex} from '~/common/utils/byte';
import {intoUnsignedLong, u16ToBytesLe} from '~/common/utils/number';
import chaiByteEqual from '~/test/common/plugins/byte-equal';
import {
    MOCK_URL,
    makeTestFileSystemKeyStorage,
    makeTestServicesWithoutIdentity,
} from '~/test/mocha/common/backend-mocks';

const {expect} = chai.use(chaiByteEqual);

/**
 * Key storage tests.
 */
export function run(): void {
    const {crypto, electron, logging, systemInfo} = makeTestServicesWithoutIdentity();

    describe('FileSystemKeyStorage', function () {
        let deprecatedKeyStoragePath: string;
        let keyStorage: FileSystemKeyStorage;
        let keyStoragePath: string;
        let profileDirectoryPath: string;

        this.beforeEach(function () {
            const keyStorageDetails = makeTestFileSystemKeyStorage({
                crypto,
                electron,
                logging,
                systemInfo,
            });
            deprecatedKeyStoragePath = keyStorageDetails.deprecatedKeyStoragePath;
            keyStorage = keyStorageDetails.keyStorage;
            keyStoragePath = keyStorageDetails.keyStoragePath;
            profileDirectoryPath = keyStorageDetails.profileDirectoryPath;
        });

        this.afterEach(function () {
            fs.rmSync(profileDirectoryPath, {recursive: true});
        });

        // ASCII: 46 = '.' / 42 = '*'
        const salt1 = new Uint8Array([
            46, 46, 46, 46, 42, 42, 42, 42, 46, 46, 46, 46, 42, 42, 42, 42,
        ]);
        const salt2 = new Uint8Array([
            42, 46, 42, 46, 42, 46, 42, 46, 42, 46, 42, 46, 42, 46, 42, 46,
        ]);
        const deriveKeyParams = [
            // Params: password, iterations, salt, expected
            //
            // To invoke using the argon2 CLI utility, here's the example for the first param entry:
            //
            // $ echo -n 'supersafe' | argon2 '....****....****' -id -t 25 -k 1024 -p 1
            [
                'supersafe',
                25,
                salt1,
                'c965a5e68a80a03f996de468351dd0c4a66559dc7a7c3662173ecfb82d794d1e',
            ],
            [
                'supersafe',
                50,
                salt1,
                '299f42dd0686da6c2a68064fe493cfc6cdd04d041f4c0172b794dce8b3f32466',
            ],
            [
                'supersafe',
                50,
                salt2,
                '7e2ba8734a4ebc94d4cf8da5dfaaa53b58770106e0e55a422e65216ebc618fce',
            ],
            [
                'verys3cur3',
                50,
                salt1,
                '113dd961e5d4c21ebcbc3135546d4fce4374e01a055b2f57c01b2667db87611a',
            ],
        ] as const;
        deriveKeyParams.forEach(([password, iterations, salt, expected]) => {
            it(`derive intermediate key storage key with (pw=${password}, iterations=${iterations}, salt=${salt[0]}${salt[1]}${salt[2]}…)`, async function () {
                // @ts-expect-error: Private property
                const rawKey = await keyStorage._deriveKey(password, {
                    version: Argon2Version.fromArgon2VersionByte(0x13),
                    salt,
                    memoryBytes: 1 * MiB,
                    iterations,
                    parallelism: 1,
                });
                expect(bytesToHex(rawKey.unwrap())).to.equal(expected);
            });
        });

        describe('migrate key storage from version one to version 2', function () {
            it('successfully migrate a valid key storage', async function () {
                // Increase the timeout since migration is slow.
                this.timeout(100000);
                // Passwords used for encryption / decryption
                const password = 'incred1bly s3cur3!!11';

                // Encryption params, intentionally very low for testing
                const argonParams: Argon2idParameters = {
                    version: Argon2Version.fromArgon2VersionByte(0x13),
                    salt: crypto.randomBytes(
                        new Uint8Array(ARGON2_MIN_PARAMS.accept.saltLengthBytes),
                    ),
                    memoryBytes: 1 * MiB,
                    iterations: ARGON2_MIN_PARAMS.accept.iterations,
                    parallelism: ARGON2_MIN_PARAMS.accept.parallelism,
                };

                // Keys
                const keys = {
                    // @ts-expect-error: Private property
                    filestoreEncryptionKey: await keyStorage._deriveKey(password, argonParams),
                    ck: crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                    dgk: crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                    databaseKey: crypto.randomBytes(new Uint8Array(DATABASE_KEY_LENGTH)),
                };

                // Build an EncryptedKeyStorage
                const encodedBytes = InnerKeyStorageV1.encode({
                    schemaVersion: 2,
                    identityData: {
                        identity: '00000001',
                        ck: keys.ck,
                        serverGroup: '01',
                    },
                    dgk: keys.dgk,
                    databaseKey: keys.databaseKey,
                    deviceIds: {
                        d2mDeviceId: intoUnsignedLong(1337n),
                        cspDeviceId: intoUnsignedLong(2448n),
                    },
                    workCredentials: {
                        username: 'peter',
                        password: 'passwörtli',
                    },
                    onPremConfig: {
                        oppfUrl: MOCK_URL.toString(),
                        oppfCachedConfig: '',
                        lastUpdated: intoUnsignedLong(BigInt(new Date().getUTCMilliseconds())),
                    },
                    deviceCookie: ensureDeviceCookie(
                        new Uint8Array(16),
                    ) as ReadonlyUint8Array as Uint8Array,
                }).finish() as PlainData;
                const encryptedKeyStorageBytes = crypto
                    .getSecretBox(
                        keys.filestoreEncryptionKey.asReadonly(),
                        NONCE_UNGUARDED_SCOPE,
                        undefined,
                    )
                    .encryptor(CREATE_BUFFER_TOKEN, encodedBytes)
                    .encryptWithRandomNonceAhead(undefined);
                const encryptedKeyStorageFileBytes = OuterKeyStorageV1.encode({
                    schemaVersion: 1,
                    encryptedKeyStorage: encryptedKeyStorageBytes,
                    kdfParameters: {
                        $case: 'argon2id',
                        argon2id: {
                            version:
                                // Ugly cast but necessary here to not have to write a separate function here.
                                argonParams.version.toProtobuf() as unknown as OuterKeyStorageV1_Argon2idParameters_Argon2Version,
                            salt: argonParams.salt,
                            memoryBytes: argonParams.memoryBytes,
                            iterations: argonParams.iterations,
                            parallelism: argonParams.parallelism,
                        },
                    },
                }).finish();

                // Write to file.
                fs.writeFileSync(deprecatedKeyStoragePath, encryptedKeyStorageFileBytes);

                // Now, read the file i.e. perform the migration and all inner migrations.
                const migratedKeyStorageContents = await keyStorage.read(password);

                // Check that the content is the same.
                expect(migratedKeyStorageContents.identityData.ck.unwrap()).to.byteEqual(keys.ck);
                expect(migratedKeyStorageContents.dgk.unwrap()).to.byteEqual(keys.dgk);
                expect(migratedKeyStorageContents.databaseKey.unwrap()).to.byteEqual(
                    keys.databaseKey,
                );
                expect(migratedKeyStorageContents.deviceIds.d2mDeviceId).to.equal(1337n);
                expect(migratedKeyStorageContents.deviceIds.cspDeviceId).to.equal(2448n);
                expect(migratedKeyStorageContents.workCredentials?.username).to.equal('peter');
                expect(migratedKeyStorageContents.workCredentials?.password).to.equal('passwörtli');
            });
        });

        describe(`read encrypted key storage`, function () {
            async function readEncryptedKeyStorageAndExpectError(
                type: KeyStorageErrorType,
            ): Promise<void> {
                let thrown = false;
                try {
                    // @ts-expect-error: Private property
                    await keyStorage._readOuterKeyStorage();
                } catch (error) {
                    thrown = true;
                    expect(error).to.be.instanceOf(KeyStorageError);
                    assertError(error, KeyStorageError);
                    expect(error.type, error.message).to.equal(type);
                }
                if (!thrown) {
                    expect.fail(`Exception of type ${type} not thrown`);
                }
            }

            it('should throw if file not present', async function () {
                await readEncryptedKeyStorageAndExpectError('not-found');
            });

            it('should reject directory as path', async function () {
                fs.mkdirSync(keyStoragePath);
                await readEncryptedKeyStorageAndExpectError('not-readable');
            });

            it('should reject empty file', async function () {
                fs.writeFileSync(keyStoragePath, '');
                await readEncryptedKeyStorageAndExpectError('malformed');
            });

            it('should accept valid file', async function () {
                // Write actual data to file
                const encryptedKeyStorageBytes = new Uint8Array(41);
                const bytes = byteJoin(
                    u16ToBytesLe(OuterKeyStorageV2_OuterVersion.V2_0),
                    OuterKeyStorageV2.encode({
                        encryptedIntermediate: encryptedKeyStorageBytes,
                        kdfParameters: {
                            $case: 'argon2id',
                            argon2id: {
                                version:
                                    OuterKeyStorageV2_Argon2idParameters_Argon2Version.VERSION_1_3,
                                salt: new Uint8Array(32),
                                memoryBytes: 64 * MiB,
                                iterations: ARGON2_MIN_PARAMS.accept.iterations,
                                parallelism: ARGON2_MIN_PARAMS.accept.parallelism,
                            },
                        },
                    }).finish(),
                );

                fs.writeFileSync(keyStoragePath, bytes);

                // Now decoding should succeed
                const encryptedKeyStorage =
                    // @ts-expect-error: Private property
                    await keyStorage._readOuterKeyStorage();

                expect(encryptedKeyStorage.encryptedIntermediate).to.byteEqual(
                    encryptedKeyStorageBytes,
                );

                expect(encryptedKeyStorage.kdfParameters.$case).to.equal('argon2id');
                expect(encryptedKeyStorage.kdfParameters.argon2id.memoryBytes).to.equal(64 * MiB);
            });
        });

        describe(`write encrypted key storage`, function () {
            const password = 'incred1bly s3cur3!!11';
            let argonParams: Argon2idParameters;

            this.beforeEach(function () {
                argonParams = {
                    version: Argon2Version.fromArgon2VersionByte(0x13),
                    salt: crypto.randomBytes(
                        new Uint8Array(ARGON2_MIN_PARAMS.accept.saltLengthBytes),
                    ),
                    memoryBytes: 1 * MiB,
                    iterations: ARGON2_MIN_PARAMS.accept.iterations,
                    parallelism: ARGON2_MIN_PARAMS.accept.parallelism,
                };
            });

            /**
             * Prepare an encrypted key storage.
             */
            async function makeEncryptedKeyStorage(): Promise<OuterKeyStorageV2> {
                // @ts-expect-error: Private property
                return await keyStorage._encryptKeyStorage(
                    {
                        inner: {
                            $case: 'plaintextInner',
                            plaintextInner: byteJoin(
                                u16ToBytesLe(InnerKeyStorageV2_InnerVersion.V2_0),
                                InnerKeyStorageV2.encode({
                                    identityData: {
                                        identity: ensureIdentityString('00000001'),
                                        ck: wrapRawClientKey(
                                            crypto.randomBytes(new Uint8Array(32)),
                                        ).unwrap(),
                                        serverGroup: ensureServerGroup('01'),
                                    },
                                    dgk: wrapRawDeviceGroupKey(
                                        crypto.randomBytes(new Uint8Array(32)),
                                    ).unwrap(),
                                    databaseKey: wrapRawDatabaseKey(
                                        crypto.randomBytes(new Uint8Array(32)),
                                    ).unwrap(),
                                    deviceIds: {
                                        d2mDeviceId: intoUnsignedLong(ensureD2mDeviceId(1337n)),
                                        cspDeviceId: intoUnsignedLong(ensureCspDeviceId(7331n)),
                                    },
                                    deviceCookie: ensureDeviceCookie(
                                        new Uint8Array(16),
                                    ) as ReadonlyUint8Array as Uint8Array,
                                    onPremConfig: undefined,
                                    workCredentials: undefined,
                                }).finish(),
                            ),
                        },
                    },

                    password,
                    argonParams,
                );
            }

            async function writeEncryptedKeyStorageAndExpectError(
                outerKeyStorage: OuterKeyStorageV2,
                type: KeyStorageErrorType,
            ): Promise<void> {
                let thrown = false;
                try {
                    // @ts-expect-error: Private property
                    await keyStorage._writeOuterKeyStorage(outerKeyStorage);
                } catch (error) {
                    thrown = true;
                    expect(error).to.be.instanceOf(KeyStorageError);
                    assertError(error, KeyStorageError);
                    expect(error.type, error.message).to.equal(type);
                }
                if (!thrown) {
                    expect.fail(`Exception of type ${type} not thrown`);
                }
            }

            it('should encode and encrypt key storage', async function () {
                // Prepare encrypted key storage
                const encrypted = await makeEncryptedKeyStorage();

                // Ensure that encrypted key storage matches the input parameters
                expect(encrypted.encryptedIntermediate.byteLength).to.be.greaterThan(
                    NACL_CONSTANTS.NONCE_LENGTH + NACL_CONSTANTS.MAC_LENGTH,
                );
                expect(encrypted.kdfParameters?.$case).to.equal('argon2id');
                expect(encrypted.kdfParameters?.argon2id).not.to.be.undefined;
                const p = encrypted.kdfParameters?.argon2id;
                assert(p !== undefined);
                expect(p.version).to.equal(
                    OuterKeyStorageV2_Argon2idParameters_Argon2Version.VERSION_1_3,
                );
                expect(p.salt).to.byteEqual(argonParams.salt);
                expect(p.memoryBytes).to.equal(argonParams.memoryBytes);
                expect(p.iterations).to.equal(argonParams.iterations);
                expect(p.parallelism).to.equal(argonParams.parallelism);
            });

            it('should write key storage to file', async function () {
                // Prepare encrypted key storage
                const encrypted = await makeEncryptedKeyStorage();

                // Write to file
                expect(fs.existsSync(keyStoragePath)).to.be.false;
                // @ts-expect-error: Private property
                await keyStorage._writeOuterKeyStorage(encrypted);
                expect(fs.existsSync(keyStoragePath)).to.be.true;

                // Ensure that file can be read again
                const readEncryptedKeyStorage =
                    // @ts-expect-error: Private property
                    await keyStorage._readOuterKeyStorage();
                expect(readEncryptedKeyStorage.kdfParameters.argon2id.salt).to.byteEqual(
                    argonParams.salt,
                );
            });

            it('should throw an appropriate error if writing fails', async function () {
                fs.mkdirSync(keyStoragePath);
                await writeEncryptedKeyStorageAndExpectError(
                    await makeEncryptedKeyStorage(),
                    'not-writable',
                );
            });
        });

        describe('decrypt key storage', function () {
            // Passwords used for encryption / decryption
            const validPassword = 'incred1bly s3cur3!!11';
            const invalidPassword = 'not-the-password';

            // Encryption params
            const argonParams: Argon2idParameters = {
                version: Argon2Version.fromArgon2VersionByte(0x13),
                salt: crypto.randomBytes(new Uint8Array(ARGON2_MIN_PARAMS.create.saltLengthBytes)),
                memoryBytes: 1 * MiB,
                iterations: ARGON2_MIN_PARAMS.accept.iterations,
                parallelism: ARGON2_MIN_PARAMS.accept.parallelism,
            };

            let keys: {
                filestoreEncryptionKey: RawKey<32>;
                ck: Uint8Array;
                dgk: Uint8Array;
                databaseKey: Uint8Array;
            };
            let validOuterKeyStorage: OuterKeyStorageV2;
            this.beforeAll(async function () {
                // Generate keys
                keys = {
                    // @ts-expect-error: Private property
                    filestoreEncryptionKey: await keyStorage._deriveKey(validPassword, argonParams),
                    ck: crypto.randomBytes(new Uint8Array(32)),
                    dgk: crypto.randomBytes(new Uint8Array(32)),
                    databaseKey: crypto.randomBytes(new Uint8Array(32)),
                };

                const innerData = InnerKeyStorageV2.encode({
                    identityData: {
                        identity: '00000001',
                        ck: keys.ck,
                        serverGroup: ensureServerGroup('01'),
                    },
                    deviceCookie: ensureDeviceCookie(
                        new Uint8Array(16),
                    ) as ReadonlyUint8Array as Uint8Array,
                    dgk: keys.dgk,
                    databaseKey: keys.databaseKey,
                    deviceIds: {
                        d2mDeviceId: intoUnsignedLong(1337n),
                        cspDeviceId: intoUnsignedLong(2448n),
                    },
                    workCredentials: undefined,
                    onPremConfig: {
                        oppfUrl: MOCK_URL.toString(),
                        oppfCachedConfig: '',
                        lastUpdated: intoUnsignedLong(BigInt(new Date().getUTCMilliseconds())),
                    },
                }).finish();

                const versionPrependedInnerData = byteJoin(
                    u16ToBytesLe(InnerKeyStorageV2_InnerVersion.V2_0),
                    innerData,
                );

                const intermediateData = IntermediateKeyStorageV1.encode({
                    inner: {
                        $case: 'plaintextInner',
                        plaintextInner: versionPrependedInnerData,
                    },
                }).finish();

                const versionPrependendIntermediateData = byteJoin(
                    u16ToBytesLe(IntermediateKeyStorageV1_IntermediateVersion.V1_0),
                    intermediateData,
                );

                // Generate valid encrypted key storage.
                validOuterKeyStorage = {
                    encryptedIntermediate: crypto
                        .getSecretBox(
                            keys.filestoreEncryptionKey.asReadonly(),
                            NONCE_UNGUARDED_SCOPE,
                            undefined,
                        )
                        .encryptor(
                            CREATE_BUFFER_TOKEN,
                            versionPrependendIntermediateData as PlainData,
                        )
                        .encryptWithRandomNonceAhead(undefined),
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
                };
            });

            // Helper function
            async function decryptKeyStorageAndExpectError(
                encryptedKeyStorage: OuterKeyStorageV2,
                password: string,
                type: KeyStorageErrorType,
            ): Promise<void> {
                let thrown = false;
                try {
                    const parsedKeyStorage =
                        OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V2.parse(encryptedKeyStorage);
                    // @ts-expect-error: Private property
                    await keyStorage._decryptAndValidateKeyStorage(parsedKeyStorage, password);
                } catch (error) {
                    thrown = true;
                    expect(error).to.be.instanceOf(KeyStorageError);
                    assertError(error, KeyStorageError);
                    expect(error.type, error.message).to.equal(type);
                }
                if (!thrown) {
                    expect.fail(`Exception of type ${type} not thrown`);
                }
            }

            it('should reject key storage with malformed protobuf bytes', async function () {
                const encryptedInvalidKeyStorageBytes = crypto
                    .getSecretBox(
                        keys.filestoreEncryptionKey.asReadonly(),
                        NONCE_UNGUARDED_SCOPE,
                        undefined,
                    )
                    .encryptor(CREATE_BUFFER_TOKEN, new Uint8Array([1, 2, 3, 4]) as PlainData)
                    .encryptWithRandomNonceAhead(undefined);
                const encryptedInvalidKeyStorage: OuterKeyStorageV2 = {
                    encryptedIntermediate: encryptedInvalidKeyStorageBytes,
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
                };

                // Decrypt with valid password (but the protobuf data inside is not valid)
                await decryptKeyStorageAndExpectError(
                    encryptedInvalidKeyStorage,
                    validPassword,
                    'malformed',
                );
            });

            it('should reject key storage with valid protobuf but invalid password', async function () {
                // Decrypt with invalid password
                await decryptKeyStorageAndExpectError(
                    validOuterKeyStorage,
                    invalidPassword,
                    'undecryptable',
                );
            });

            it('should accept valid key storage', async function () {
                // Decrypt with valid password, this should succeed
                const validatedOuterKeyStorage =
                    OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V2.parse(validOuterKeyStorage);
                // @ts-expect-error: Private property
                const decryptedKeyStorage = await keyStorage._decryptAndValidateKeyStorage(
                    validatedOuterKeyStorage,
                    validPassword,
                );
                expect(decryptedKeyStorage.identityData.ck.unwrap()).to.byteEqual(keys.ck);
                expect(decryptedKeyStorage.dgk.unwrap()).to.byteEqual(keys.dgk);
                expect(decryptedKeyStorage.databaseKey.unwrap()).to.byteEqual(keys.databaseKey);
            });
        });

        /**
         * Test successful decryption of a key storage from file system.
         */
        it(`should read valid file`, async function () {
            // Passwords used for encryption / decryption
            const password = 'incred1bly s3cur3!!11';

            // Encryption params, intentionally very low for testing
            const argonParams: Argon2idParameters = {
                version: Argon2Version.fromArgon2VersionByte(0x13),
                salt: crypto.randomBytes(new Uint8Array(ARGON2_MIN_PARAMS.accept.saltLengthBytes)),
                memoryBytes: 1 * MiB,
                iterations: ARGON2_MIN_PARAMS.accept.iterations,
                parallelism: ARGON2_MIN_PARAMS.accept.parallelism,
            };

            // Keys
            const keys = {
                // @ts-expect-error: Private property
                filestoreEncryptionKey: await keyStorage._deriveKey(password, argonParams),
                ck: crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                dgk: crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                databaseKey: crypto.randomBytes(new Uint8Array(DATABASE_KEY_LENGTH)),
            };

            // Build an EncryptedKeyStorage
            const encodedInnerBytes = byteJoin(
                u16ToBytesLe(InnerKeyStorageV2_InnerVersion.V2_0),
                InnerKeyStorageV2.encode({
                    identityData: {
                        identity: '00000001',
                        ck: keys.ck,
                        serverGroup: '01',
                    },
                    dgk: keys.dgk,
                    databaseKey: keys.databaseKey,
                    deviceIds: {
                        d2mDeviceId: intoUnsignedLong(1337n),
                        cspDeviceId: intoUnsignedLong(2448n),
                    },
                    workCredentials: {
                        username: 'peter',
                        password: 'passwörtli',
                    },
                    onPremConfig: {
                        oppfUrl: MOCK_URL.toString(),
                        oppfCachedConfig: '',
                        lastUpdated: intoUnsignedLong(BigInt(new Date().getUTCMilliseconds())),
                    },
                    deviceCookie: ensureDeviceCookie(
                        new Uint8Array(16),
                    ) as ReadonlyUint8Array as Uint8Array,
                }).finish(),
            );

            const encodedIntermediateBytes = byteJoin(
                u16ToBytesLe(IntermediateKeyStorageV1_IntermediateVersion.V1_0),
                IntermediateKeyStorageV1.encode({
                    inner: {
                        $case: 'plaintextInner',
                        plaintextInner: encodedInnerBytes,
                    },
                }).finish(),
            );

            const encryptedKeyStorageBytes = crypto
                .getSecretBox(
                    keys.filestoreEncryptionKey.asReadonly(),
                    NONCE_UNGUARDED_SCOPE,
                    undefined,
                )
                .encryptor(CREATE_BUFFER_TOKEN, encodedIntermediateBytes as PlainData)
                .encryptWithRandomNonceAhead(undefined);
            const encryptedKeyStorageFileBytes = byteJoin(
                u16ToBytesLe(OuterKeyStorageV2_OuterVersion.V2_0),
                OuterKeyStorageV2.encode({
                    encryptedIntermediate: encryptedKeyStorageBytes,
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
            );

            // Write to file
            fs.writeFileSync(keyStoragePath, encryptedKeyStorageFileBytes);

            // Read, decode, decrypt, decode key storage
            const keyStorageContents: InnerKeyStorageFileContentsV2 =
                await keyStorage.read(password);
            expect(keyStorageContents.identityData.ck.unwrap()).to.byteEqual(keys.ck);
            expect(keyStorageContents.dgk.unwrap()).to.byteEqual(keys.dgk);
            expect(keyStorageContents.databaseKey.unwrap()).to.byteEqual(keys.databaseKey);
            expect(keyStorageContents.deviceIds.d2mDeviceId).to.equal(1337n);
            expect(keyStorageContents.deviceIds.cspDeviceId).to.equal(2448n);
            expect(keyStorageContents.workCredentials?.username).to.equal('peter');
            expect(keyStorageContents.workCredentials?.password).to.equal('passwörtli');
        });
    });
}

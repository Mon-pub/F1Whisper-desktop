import {expect} from 'chai';
import Long from 'long';
import {stub} from 'sinon';
import nacl from 'tweetnacl';

import type {EarlyBackendServicesThatDontRequireConfig} from '~/common/backend';
import {STATIC_CONFIG} from '~/common/config';
import {ensureEd25519PublicKey, type Ed25519PublicKey} from '~/common/crypto';
import type {ThreemaWorkCredentials} from '~/common/device';
import {Backend} from '~/common/dom/backend';
import {BackendCreationError} from '~/common/dom/backend/errors';
import type {OppfFile} from '~/common/dom/backend/onprem/oppf';
import {recoverCertificatePins} from '~/common/dom/backend/spki';
import {OnPremConfig as OnPremConfigMessage} from '~/common/internal-protobuf/key-storage-file';
import type {
    KeyStorageInitOverrides,
    KeyStorageIntermediateDecodeHandler,
    KeyStorageOnPremConfigStoreData,
} from '~/common/key-storage';
import {NOOP_LOGGER} from '~/common/logging';
import {u8aToBase64} from '~/common/utils/base64';
import {UTF8} from '~/common/utils/codec';
import {TestTweetNaClBackend} from '~/test/mocha/common/backend-mocks';
import {MOCK_OPPF} from '~/test/mocha/common/onprem/oppf-mock';

interface Intermediate {
    readonly onPremConfig:
        | {
              readonly oppfUrl: string;
              readonly oppfCachedConfig: string;
              readonly oppfCachedConfigIsFallback: boolean;
              readonly lastUpdated: unknown;
          }
        | undefined;
    readonly workCredentials: {readonly username: string; readonly password: string} | undefined;
}

interface RemoteSecretOppfBootstrap {
    readonly source: 'live-regular' | 'fallback-handoff';
    readonly oppfFile: {readonly parsed: OppfFile; readonly string: string};
    readonly keyStorageOverrides: KeyStorageInitOverrides;
}

/** Regression tests for live-only Remote Secret OPPF and session-atomic policy activation. */
export function run(): void {
    describe('Remote Secret live OPPF bootstrap ordering', function () {
        const backendInternals = Backend as unknown as {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            readonly _createOldProfileRemoteSecretPreparationHandler: (
                phase1Services: EarlyBackendServicesThatDontRequireConfig,
                deadlineMs: number,
            ) => KeyStorageIntermediateDecodeHandler;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            readonly _runOldProfileAccessWithLinkedProfilePinsRestored: <T>(
                phase1Services: EarlyBackendServicesThatDontRequireConfig,
                linkedProfileOppfFile:
                    | {readonly parsed: OppfFile; readonly string: string}
                    | undefined,
                accessOldProfile: () => Promise<T>,
            ) => Promise<T>;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            readonly _resolveOppfAndInstallCurrentPinsForRemoteSecret: (
                phase1Services: EarlyBackendServicesThatDontRequireConfig,
                intermediate: Intermediate,
                isInnerRemoteSecretProtected: boolean,
                deadlineMs?: number,
                allowFallbackHandoff?: boolean,
            ) => Promise<RemoteSecretOppfBootstrap | undefined>;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            readonly _resolveOnPremOppfFile: (
                phase1Services: EarlyBackendServicesThatDontRequireConfig,
                keyStoragePassword: string,
                workCredentials: ThreemaWorkCredentials,
                storedOnPremConfig: KeyStorageOnPremConfigStoreData,
                log: typeof NOOP_LOGGER,
            ) => Promise<{
                readonly parsed: OppfFile;
                readonly selectedStagedFallback: boolean;
                readonly deferredOnPremConfig?: NonNullable<KeyStorageOnPremConfigStoreData>;
            }>;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            readonly _consumePlaintextFallbackHandoff: (
                phase1Services: EarlyBackendServicesThatDontRequireConfig,
                keyStoragePassword: string,
                workCredentials: ThreemaWorkCredentials,
                storedOnPremConfig: NonNullable<KeyStorageOnPremConfigStoreData>,
                log: typeof NOOP_LOGGER,
            ) => Promise<void>;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            readonly _inFlightOppfRefresh: Promise<void>;
        };
        const resolveForRemoteSecret =
            backendInternals._resolveOppfAndInstallCurrentPinsForRemoteSecret;
        const createOldProfilePreparationHandler =
            backendInternals._createOldProfileRemoteSecretPreparationHandler;
        const runOldProfileAccessWithLinkedPinsRestored =
            backendInternals._runOldProfileAccessWithLinkedProfilePinsRestored;
        const resolveOnPremOppfFile = backendInternals._resolveOnPremOppfFile.bind(Backend);
        const consumePlaintextFallbackHandoff =
            backendInternals._consumePlaintextFallbackHandoff.bind(Backend);

        const WORK_CREDENTIALS = {username: 'test-user', password: 'test-pass'};
        const OPPF_URL = 'https://oppf.example/config.oppf';
        const TEST_SIGNING_SEED = new Uint8Array(
            Array.from({length: 32}, (_, index) => (index * 7 + 11) % 256),
        );

        this.beforeAll(function () {
            // eslint-disable-next-line turbo/no-undeclared-env-vars
            if (import.meta.env.BUILD_ENVIRONMENT !== 'onprem') {
                this.skip();
            }
        });

        function makeSpkiBase64(fillByte: number): string {
            return u8aToBase64(new Uint8Array(32).fill(fillByte));
        }

        it('round-trips the fallback marker and defaults legacy payloads to regular policy', function () {
            const regular = OnPremConfigMessage.decode(
                OnPremConfigMessage.encode({
                    oppfUrl: OPPF_URL,
                    oppfCachedConfig: '{}',
                    oppfCachedConfigIsFallback: false,
                    lastUpdated: Long.UZERO,
                }).finish(),
            );
            const fallback = OnPremConfigMessage.decode(
                OnPremConfigMessage.encode({
                    ...regular,
                    oppfCachedConfigIsFallback: true,
                }).finish(),
            );

            expect(regular.oppfCachedConfigIsFallback).to.be.false;
            expect(fallback.oppfCachedConfigIsFallback).to.be.true;
        });

        function makeIntermediate(cachedConfig: string): Intermediate {
            return {
                onPremConfig: {
                    oppfUrl: OPPF_URL,
                    oppfCachedConfig: cachedConfig,
                    oppfCachedConfigIsFallback: false,
                    lastUpdated: Date.now(),
                },
                workCredentials: WORK_CREDENTIALS,
            };
        }

        function makePhase1Services(overrides: {
            readonly getOppFile: ReturnType<typeof stub>;
            readonly updatePublicKeyPins: ReturnType<typeof stub>;
            readonly setOnPremConfig?: ReturnType<typeof stub>;
        }): EarlyBackendServicesThatDontRequireConfig {
            /* eslint-disable @typescript-eslint/no-unsafe-assignment */
            return {
                electron: {
                    getOppFile: overrides.getOppFile,
                    updatePublicKeyPins: overrides.updatePublicKeyPins,
                },
                keyStorage: {
                    setOnPremConfig: overrides.setOnPremConfig ?? stub().resolves(undefined),
                },
                crypto: new TestTweetNaClBackend(),
            } as unknown as EarlyBackendServicesThatDontRequireConfig;
            /* eslint-enable @typescript-eslint/no-unsafe-assignment */
        }

        function buildSignedOppf(overrides: {
            readonly keypair: nacl.SignKeyPair;
            readonly spkiValue: string;
            readonly workUrl?: string;
        }): {
            readonly bodyString: string;
            readonly string: string;
            readonly buffer: ArrayBuffer;
        } {
            const body = {
                ...MOCK_OPPF,
                signatureKey: u8aToBase64(overrides.keypair.publicKey),
                license: {...MOCK_OPPF.license, expires: '2300-12-01'},
                work: {url: overrides.workUrl ?? MOCK_OPPF.work.url},
                domains: {
                    rules: [
                        {
                            fqdn: '*test.ch',
                            matchMode: 'include-subdomains',
                            spkis: [{algorithm: 'sha256', value: overrides.spkiValue}],
                        },
                    ],
                },
            };
            const bodyString = JSON.stringify(body);
            const bodyBytes = UTF8.encode(bodyString);
            const signature = nacl.sign.detached(bodyBytes, overrides.keypair.secretKey);
            const payloadString = `${bodyString}\n${u8aToBase64(signature)}`;
            return {
                bodyString,
                string: payloadString,
                buffer: UTF8.encode(payloadString).buffer as ArrayBuffer,
            };
        }

        async function withTrustedTestKey<T>(
            publicKey: Ed25519PublicKey,
            fn: () => Promise<T>,
        ): Promise<T> {
            const trustedKeys =
                STATIC_CONFIG.ONPREM_CONFIG_TRUSTED_PUBLIC_KEYS as Ed25519PublicKey[];
            trustedKeys.push(publicKey);
            try {
                return await fn();
            } finally {
                const index = trustedKeys.indexOf(publicKey);
                if (index !== -1) {
                    trustedKeys.splice(index, 1);
                }
            }
        }

        it('does not add network work to non-Remote-Secret cached startup', async function () {
            const getOppFile = stub().rejects(new Error('must not be called'));
            const updatePublicKeyPins = stub().rejects(new Error('must not be called'));
            const services = makePhase1Services({getOppFile, updatePublicKeyPins});

            const result = await resolveForRemoteSecret(services, makeIntermediate('{}'), false);

            expect(result).to.be.undefined;
            expect(getOppFile.called).to.be.false;
            expect(updatePublicKeyPins.called).to.be.false;
        });

        it('ignores even a fresh cache, installs verified live pins/current endpoint, and does not persist before init', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const liveSpki = makeSpkiBase64(0x44);
            const liveWorkUrl = 'https://current-work.example/';
            const live = buildSignedOppf({keypair, spkiValue: liveSpki, workUrl: liveWorkUrl});
            const getOppFile = stub().resolves(live.buffer);
            const updatePublicKeyPins = stub().resolves(true);
            const setOnPremConfig = stub().rejects(
                new Error('must not persist before key storage init completes'),
            );
            const services = makePhase1Services({
                getOppFile,
                updatePublicKeyPins,
                setOnPremConfig,
            });
            const cached = JSON.stringify({
                ...MOCK_OPPF,
                work: {url: 'https://stale-work.example/'},
                domains: {rules: []},
            });

            const result = await withTrustedTestKey(
                ensureEd25519PublicKey(keypair.publicKey),
                async () => await resolveForRemoteSecret(services, makeIntermediate(cached), true),
            );

            expect(getOppFile.calledOnce, 'Remote Secret always requires one live fetch').to.be
                .true;
            expect(updatePublicKeyPins.calledOnce).to.be.true;
            expect(getOppFile.calledBefore(updatePublicKeyPins)).to.be.true;
            expect(setOnPremConfig.called, 'persistence is deferred until init returns').to.be
                .false;
            expect(result?.keyStorageOverrides.remoteSecretEndpoint?.href).to.equal(liveWorkUrl);
            expect(result?.source).to.equal('live-regular');
            const installedPins = updatePublicKeyPins.firstCall.args[0] as
                | readonly {readonly spkis: readonly {readonly value: Uint8Array}[]}[]
                | undefined;
            expect(installedPins?.[0]?.spkis[0]?.value).to.deep.equal(
                new Uint8Array(32).fill(0x44),
            );
        });

        it('activates a fresh staged fallback handoff for current-profile Remote Secret startup', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const fallbackSpki = makeSpkiBase64(0x46);
            const fallbackWorkUrl = 'https://fallback-work.example/';
            const fallback = buildSignedOppf({
                keypair,
                spkiValue: fallbackSpki,
                workUrl: fallbackWorkUrl,
            });
            const getOppFile = stub().rejects(new Error('regular OPPF must not be fetched'));
            const updatePublicKeyPins = stub().resolves(true);
            const services = makePhase1Services({getOppFile, updatePublicKeyPins});
            const markedIntermediate: Intermediate = {
                onPremConfig: {
                    oppfUrl: OPPF_URL,
                    oppfCachedConfig: fallback.bodyString,
                    oppfCachedConfigIsFallback: true,
                    lastUpdated: Date.now(),
                },
                workCredentials: WORK_CREDENTIALS,
            };

            const result = await resolveForRemoteSecret(
                services,
                markedIntermediate,
                true,
                undefined,
                true,
            );

            expect(getOppFile.called).to.be.false;
            expect(updatePublicKeyPins.calledOnce).to.be.true;
            expect(result?.source).to.equal('fallback-handoff');
            expect(result?.oppfFile.string).to.equal(fallback.bodyString);
            expect(result?.keyStorageOverrides.remoteSecretEndpoint?.href).to.equal(
                fallbackWorkUrl,
            );
            const installedPins = updatePublicKeyPins.firstCall.args[0] as
                | readonly {readonly spkis: readonly {readonly value: Uint8Array}[]}[]
                | undefined;
            expect(installedPins?.[0]?.spkis[0]?.value).to.deep.equal(
                new Uint8Array(32).fill(0x46),
            );
        });

        it('rejects a stale staged fallback before pin or Remote Secret activation', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const fallback = buildSignedOppf({
                keypair,
                spkiValue: makeSpkiBase64(0x47),
                workUrl: 'https://fallback-work.example/',
            });
            const getOppFile = stub().rejects(new Error('regular OPPF must not be fetched'));
            const updatePublicKeyPins = stub().resolves(true);
            const services = makePhase1Services({getOppFile, updatePublicKeyPins});
            const intermediate: Intermediate = {
                onPremConfig: {
                    oppfUrl: OPPF_URL,
                    oppfCachedConfig: fallback.bodyString,
                    oppfCachedConfigIsFallback: true,
                    lastUpdated: 0,
                },
                workCredentials: WORK_CREDENTIALS,
            };

            let caught: unknown;
            try {
                await resolveForRemoteSecret(services, intermediate, true, undefined, true);
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.instanceOf(BackendCreationError);
            expect((caught as BackendCreationError).type).to.equal('invalid-oppf');
            expect(getOppFile.called).to.be.false;
            expect(updatePublicKeyPins.called).to.be.false;
        });

        it('isolates old-profile OPPF credentials, pins, and endpoint during restoration', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const oldProfileSpki = makeSpkiBase64(0x45);
            const oldProfileWorkUrl = 'https://old-profile-work.example/';
            const oldProfileOppfUrl = 'https://old-profile-oppf.example/config.oppf';
            const oldProfileCredentials = {
                username: 'old-profile-user',
                password: 'old-profile-pass',
            };
            const oldProfileOppf = buildSignedOppf({
                keypair,
                spkiValue: oldProfileSpki,
                workUrl: oldProfileWorkUrl,
            });
            const getOppFile = stub().resolves(oldProfileOppf.buffer);
            const updatePublicKeyPins = stub().resolves(true);
            const services = makePhase1Services({getOppFile, updatePublicKeyPins});
            const deadlineMs = Date.now() + 30_000;
            const prepareOldProfile = createOldProfilePreparationHandler(services, deadlineMs);

            const result = await withTrustedTestKey(
                ensureEd25519PublicKey(keypair.publicKey),
                async () =>
                    await prepareOldProfile({
                        intermediate: {
                            onPremConfig: {
                                oppfUrl: oldProfileOppfUrl,
                                oppfCachedConfig: '',
                                // Archived profiles must ignore and never consume this marker.
                                oppfCachedConfigIsFallback: true,
                                lastUpdated: BigInt(Date.now()),
                            },
                            workCredentials: oldProfileCredentials,
                        },
                        isInnerRemoteSecretProtected: true,
                    }),
            );

            expect(getOppFile.calledOnce).to.be.true;
            expect(getOppFile.firstCall.args.slice(0, 4)).to.deep.equal([
                oldProfileOppfUrl,
                oldProfileCredentials.username,
                oldProfileCredentials.password,
                STATIC_CONFIG.USER_AGENT,
            ]);
            expect(
                getOppFile.firstCall.args[4],
                'the absolute deadline must cross IPC unchanged so queueing consumes the budget',
            ).to.equal(deadlineMs);
            expect(getOppFile.calledBefore(updatePublicKeyPins)).to.be.true;
            expect(result?.remoteSecretEndpoint?.href).to.equal(oldProfileWorkUrl);
            expect(result?.remoteSecretRetrieval?.mode).to.equal('bounded-non-restarting');
            expect(result?.remoteSecretRetrieval?.deadlineMs).to.be.greaterThan(Date.now());
            const installedPins = updatePublicKeyPins.firstCall.args[0] as
                | readonly {readonly spkis: readonly {readonly value: Uint8Array}[]}[]
                | undefined;
            expect(installedPins?.[0]?.spkis[0]?.value).to.deep.equal(
                new Uint8Array(32).fill(0x45),
            );
        });

        it('restores linked-profile pins after both successful and failed old-profile access', async function () {
            const oldProfileRules = [{profile: 'old'}];
            const linkedProfileRules = [{profile: 'linked'}];
            const linkedProfileOppfFile = {
                parsed: {domains: {rules: linkedProfileRules}},
                string: 'linked-profile-oppf',
            } as unknown as {readonly parsed: OppfFile; readonly string: string};
            const updatePublicKeyPins = stub().resolves(true);
            const services = makePhase1Services({
                getOppFile: stub().rejects(new Error('must not be called')),
                updatePublicKeyPins,
            });

            const result = await runOldProfileAccessWithLinkedPinsRestored(
                services,
                linkedProfileOppfFile,
                async () => {
                    await updatePublicKeyPins(oldProfileRules);
                    return 'unlocked';
                },
            );

            expect(result).to.equal('unlocked');
            expect(updatePublicKeyPins.callCount).to.equal(2);
            expect(updatePublicKeyPins.firstCall.calledWithExactly(oldProfileRules)).to.be.true;
            expect(updatePublicKeyPins.secondCall.calledWithExactly(linkedProfileRules)).to.be.true;

            updatePublicKeyPins.resetHistory();
            const marker = new Error('old-profile access failed');
            let caught: unknown;
            try {
                await runOldProfileAccessWithLinkedPinsRestored(
                    services,
                    linkedProfileOppfFile,
                    async () => {
                        await updatePublicKeyPins(oldProfileRules);
                        throw marker;
                    },
                );
            } catch (error) {
                caught = error;
            }

            expect(caught).to.equal(marker);
            expect(updatePublicKeyPins.callCount).to.equal(2);
            expect(updatePublicKeyPins.firstCall.calledWithExactly(oldProfileRules)).to.be.true;
            expect(updatePublicKeyPins.secondCall.calledWithExactly(linkedProfileRules)).to.be.true;
        });

        it('fails closed when linked-profile pins cannot be restored', async function () {
            const linkedProfileRules = [{profile: 'linked'}];
            const linkedProfileOppfFile = {
                parsed: {domains: {rules: linkedProfileRules}},
                string: 'linked-profile-oppf',
            } as unknown as {readonly parsed: OppfFile; readonly string: string};
            const updatePublicKeyPins = stub().resolves(false);
            const services = makePhase1Services({
                getOppFile: stub().rejects(new Error('must not be called')),
                updatePublicKeyPins,
            });

            let caught: unknown;
            try {
                await runOldProfileAccessWithLinkedPinsRestored(
                    services,
                    linkedProfileOppfFile,
                    async () => await Promise.resolve('unlocked'),
                );
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.instanceOf(BackendCreationError);
            expect((caught as BackendCreationError).type).to.equal('update-public-key-pins-error');
            expect(updatePublicKeyPins.calledOnceWithExactly(linkedProfileRules)).to.be.true;
        });

        for (const testCase of [
            {
                missing: 'old-profile Work credentials are',
                intermediate: {
                    onPremConfig: {
                        oppfUrl: OPPF_URL,
                        oppfCachedConfig: '',
                        oppfCachedConfigIsFallback: false,
                        lastUpdated: BigInt(Date.now()),
                    },
                    workCredentials: undefined,
                },
                errorType: 'missing-work-credentials',
            },
            {
                missing: 'the old-profile OPPF URL is',
                intermediate: {
                    onPremConfig: undefined,
                    workCredentials: WORK_CREDENTIALS,
                },
                errorType: 'missing-oppf-url',
            },
        ] as const) {
            it(`fails closed before old-profile Remote Secret retrieval when ${testCase.missing} unavailable`, async function () {
                const getOppFile = stub().rejects(new Error('must not be called'));
                const updatePublicKeyPins = stub().rejects(new Error('must not be called'));
                const prepareOldProfile = createOldProfilePreparationHandler(
                    makePhase1Services({getOppFile, updatePublicKeyPins}),
                    Date.now() + 30_000,
                );

                let caught: unknown;
                try {
                    await prepareOldProfile({
                        intermediate: testCase.intermediate,
                        isInnerRemoteSecretProtected: true,
                    });
                } catch (error) {
                    caught = error;
                }

                expect(caught).to.be.instanceOf(Error);
                expect((caught as Error).cause).to.be.instanceOf(BackendCreationError);
                expect(((caught as Error).cause as BackendCreationError).type).to.equal(
                    testCase.errorType,
                );
                expect(getOppFile.called).to.be.false;
                expect(updatePublicKeyPins.called).to.be.false;
            });
        }

        it('never falls back to cached pins or endpoint when the live fetch fails', async function () {
            const getOppFile = stub().rejects(new Error('server unreachable'));
            const updatePublicKeyPins = stub().resolves(true);
            const setOnPremConfig = stub().resolves(undefined);
            const services = makePhase1Services({
                getOppFile,
                updatePublicKeyPins,
                setOnPremConfig,
            });

            let caught: unknown;
            try {
                await resolveForRemoteSecret(
                    services,
                    makeIntermediate(JSON.stringify(MOCK_OPPF)),
                    true,
                );
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.instanceOf(BackendCreationError);
            expect((caught as BackendCreationError).type).to.equal('fetch-oppf-error');
            expect(updatePublicKeyPins.called, 'cached pins must not be activated').to.be.false;
            expect(setOnPremConfig.called).to.be.false;
        });

        it('fails closed when live pin activation is rejected', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const live = buildSignedOppf({keypair, spkiValue: makeSpkiBase64(0x55)});
            const getOppFile = stub().resolves(live.buffer);
            const updatePublicKeyPins = stub().resolves(false);
            const setOnPremConfig = stub().resolves(undefined);
            const services = makePhase1Services({
                getOppFile,
                updatePublicKeyPins,
                setOnPremConfig,
            });

            let caught: unknown;
            try {
                await withTrustedTestKey(
                    ensureEd25519PublicKey(keypair.publicKey),
                    async () => await resolveForRemoteSecret(services, makeIntermediate(''), true),
                );
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.instanceOf(BackendCreationError);
            expect((caught as BackendCreationError).type).to.equal('update-public-key-pins-error');
            expect(setOnPremConfig.called).to.be.false;
        });

        it('defers fallback consumption and refresh until after the selected policy pins are accepted', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const cached = buildSignedOppf({
                keypair,
                spkiValue: makeSpkiBase64(0x65),
                workUrl: 'https://old-work.example/',
            });
            const live = buildSignedOppf({
                keypair,
                spkiValue: makeSpkiBase64(0x66),
                workUrl: 'https://new-work.example/',
            });
            const updatePublicKeyPins = stub().resolves(true);
            const setOnPremConfig = stub().resolves(undefined);
            const getOppFile = stub().resolves(live.buffer);
            const services = makePhase1Services({
                getOppFile,
                updatePublicKeyPins,
                setOnPremConfig,
            });
            const storedOnPremConfig = {
                oppfUrl: OPPF_URL,
                oppfCachedConfig: cached.bodyString,
                oppfCachedConfigIsFallback: true,
                lastUpdated: BigInt(Date.now()),
            };

            const active = await withTrustedTestKey(
                ensureEd25519PublicKey(keypair.publicKey),
                async () =>
                    await resolveOnPremOppfFile(
                        services,
                        'key-storage-password',
                        WORK_CREDENTIALS,
                        storedOnPremConfig,
                        NOOP_LOGGER,
                    ),
            );

            expect(active.selectedStagedFallback).to.be.true;
            expect(active.parsed.work.url).to.equal('https://old-work.example/');
            expect(active.parsed.domains?.rules[0]?.spkis[0]?.value).to.deep.equal(
                new Uint8Array(32).fill(0x65),
            );

            expect(await services.electron.updatePublicKeyPins(active.parsed.domains?.rules)).to.be
                .true;
            expect(updatePublicKeyPins.calledOnce, 'only selected fallback pins may be activated')
                .to.be.true;
            const installedPins = updatePublicKeyPins.firstCall.args[0] as
                | readonly {readonly spkis: readonly {readonly value: Uint8Array}[]}[]
                | undefined;
            expect(installedPins?.[0]?.spkis[0]?.value).to.deep.equal(
                new Uint8Array(32).fill(0x65),
            );
            expect(setOnPremConfig.called, 'resolution must retain provenance until pin acceptance')
                .to.be.false;
            expect(getOppFile.called, 'background refresh must wait for fallback consumption').to.be
                .false;

            await withTrustedTestKey(ensureEd25519PublicKey(keypair.publicKey), async () => {
                await consumePlaintextFallbackHandoff(
                    services,
                    'key-storage-password',
                    WORK_CREDENTIALS,
                    storedOnPremConfig,
                    NOOP_LOGGER,
                );
                await backendInternals._inFlightOppfRefresh;
            });

            expect(setOnPremConfig.callCount).to.equal(2);
            expect(setOnPremConfig.firstCall.args[1]).to.deep.include({
                oppfCachedConfig: cached.bodyString,
                oppfCachedConfigIsFallback: false,
            });
            expect(setOnPremConfig.secondCall.args[1]).to.deep.include({
                oppfCachedConfig: live.bodyString,
                oppfCachedConfigIsFallback: false,
            });
        });

        it('rejects a stale marked fallback instead of using ordinary offline grace', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const fallback = buildSignedOppf({
                keypair,
                spkiValue: makeSpkiBase64(0x67),
            });
            const getOppFile = stub().rejects(new Error('regular OPPF unavailable'));
            const setOnPremConfig = stub().resolves(undefined);
            const services = makePhase1Services({
                getOppFile,
                updatePublicKeyPins: stub().resolves(true),
                setOnPremConfig,
            });

            let caught: unknown;
            try {
                await withTrustedTestKey(
                    ensureEd25519PublicKey(keypair.publicKey),
                    async () =>
                        await resolveOnPremOppfFile(
                            services,
                            'key-storage-password',
                            WORK_CREDENTIALS,
                            {
                                oppfUrl: OPPF_URL,
                                oppfCachedConfig: fallback.bodyString,
                                oppfCachedConfigIsFallback: true,
                                lastUpdated: 0n,
                            },
                            NOOP_LOGGER,
                        ),
                );
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.instanceOf(BackendCreationError);
            expect((caught as BackendCreationError).type).to.equal('fetch-oppf-error');
            expect(getOppFile.calledOnce).to.be.true;
            expect(setOnPremConfig.called).to.be.false;
        });

        it('defers a live replacement for a stale marked fallback until pin acceptance', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const fallback = buildSignedOppf({
                keypair,
                spkiValue: makeSpkiBase64(0x68),
                workUrl: 'https://fallback-work.example/',
            });
            const live = buildSignedOppf({
                keypair,
                spkiValue: makeSpkiBase64(0x69),
                workUrl: 'https://live-work.example/',
            });
            const setOnPremConfig = stub().resolves(undefined);
            const services = makePhase1Services({
                getOppFile: stub().resolves(live.buffer),
                updatePublicKeyPins: stub().resolves(false),
                setOnPremConfig,
            });

            const resolved = await withTrustedTestKey(
                ensureEd25519PublicKey(keypair.publicKey),
                async () =>
                    await resolveOnPremOppfFile(
                        services,
                        'key-storage-password',
                        WORK_CREDENTIALS,
                        {
                            oppfUrl: OPPF_URL,
                            oppfCachedConfig: fallback.bodyString,
                            oppfCachedConfigIsFallback: true,
                            lastUpdated: 0n,
                        },
                        NOOP_LOGGER,
                    ),
            );

            expect(resolved.parsed.work.url).to.equal('https://live-work.example/');
            expect(resolved.selectedStagedFallback).to.be.false;
            expect(resolved.deferredOnPremConfig).to.deep.include({
                oppfCachedConfig: live.bodyString,
                oppfCachedConfigIsFallback: false,
            });
            expect(await services.electron.updatePublicKeyPins(resolved.parsed.domains?.rules)).to
                .be.false;
            expect(setOnPremConfig.called, 'marked state must survive until replacement pins pass')
                .to.be.false;
        });

        it('locks external requests and persists fallback policy last without activating its pins', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const fallback = buildSignedOppf({
                keypair,
                spkiValue: makeSpkiBase64(0x77),
                workUrl: 'https://new-work.example/',
            });
            const checkFallbackOppFile = stub().resolves(200);
            const getFallbackOppFile = stub().resolves(fallback.buffer);
            const lockExternalRequestsUntilRestart = stub().resolves(undefined);
            const updatePublicKeyPins = stub().rejects(new Error('must not be called'));
            const setOnPremConfig = stub().resolves(undefined);
            const services = {
                electron: {
                    checkFallbackOppFile,
                    getFallbackOppFile,
                    lockExternalRequestsUntilRestart,
                    updatePublicKeyPins,
                },
                keyStorage: {
                    isRemoteSecretEncrypted: false,
                    readIntermediateContents: stub().resolves({
                        onPremConfig: {oppfUrl: OPPF_URL},
                        workCredentials: WORK_CREDENTIALS,
                        isInnerRemoteSecretProtected: false,
                    }),
                    setOnPremConfig,
                },
                crypto: new TestTweetNaClBackend(),
            } as unknown as EarlyBackendServicesThatDontRequireConfig;
            let finishRefresh: (() => void) | undefined;
            const backgroundRefresh = new Promise<void>((resolve) => {
                finishRefresh = resolve;
            });
            const recover = recoverCertificatePins(
                services,
                {logger: () => NOOP_LOGGER},
                async () => await backgroundRefresh,
            );

            const recovery = withTrustedTestKey(
                ensureEd25519PublicKey(keypair.publicKey),
                async () => await recover('key-storage-password'),
            );
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });

            expect(lockExternalRequestsUntilRestart.calledOnce).to.be.true;
            expect(setOnPremConfig.called, 'fallback must wait for the background refresh').to.be
                .false;
            expect(updatePublicKeyPins.called, 'fallback pins must not be activated live').to.be
                .false;

            finishRefresh?.();
            expect(await recovery).to.deep.equal({isRemoteSecretActive: false});
            expect(
                checkFallbackOppFile.calledOnceWithExactly(
                    'https://oppf.example/config.fallback.oppf',
                    STATIC_CONFIG.USER_AGENT,
                ),
            ).to.be.true;
            expect(getFallbackOppFile.calledOnce).to.be.true;
            expect(lockExternalRequestsUntilRestart.calledBefore(setOnPremConfig)).to.be.true;
            expect(setOnPremConfig.calledOnce).to.be.true;
            expect(setOnPremConfig.firstCall.args[1]).to.deep.include({
                oppfUrl: OPPF_URL,
                oppfCachedConfig: fallback.bodyString,
                oppfCachedConfigIsFallback: true,
            });
        });

        it('does not persist fallback policy when terminal request lockdown fails', async function () {
            const keypair = nacl.sign.keyPair.fromSeed(TEST_SIGNING_SEED);
            const fallback = buildSignedOppf({
                keypair,
                spkiValue: makeSpkiBase64(0x78),
                workUrl: 'https://new-work.example/',
            });
            const setOnPremConfig = stub().resolves(undefined);
            const services = {
                electron: {
                    checkFallbackOppFile: stub().resolves(200),
                    getFallbackOppFile: stub().resolves(fallback.buffer),
                    lockExternalRequestsUntilRestart: stub().rejects(
                        new Error('connection closure failed'),
                    ),
                },
                keyStorage: {
                    isRemoteSecretEncrypted: false,
                    readIntermediateContents: stub().resolves({
                        onPremConfig: {oppfUrl: OPPF_URL},
                        workCredentials: WORK_CREDENTIALS,
                        isInnerRemoteSecretProtected: false,
                    }),
                    setOnPremConfig,
                },
                crypto: new TestTweetNaClBackend(),
            } as unknown as EarlyBackendServicesThatDontRequireConfig;

            let caught: unknown;
            try {
                await withTrustedTestKey(
                    ensureEd25519PublicKey(keypair.publicKey),
                    async () =>
                        await recoverCertificatePins(
                            services,
                            {logger: () => NOOP_LOGGER},
                            async () => await Promise.resolve(),
                        )('key-storage-password'),
                );
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.instanceOf(BackendCreationError);
            expect((caught as BackendCreationError).type).to.equal('update-public-key-pins-error');
            expect(setOnPremConfig.called).to.be.false;
        });
    });
}

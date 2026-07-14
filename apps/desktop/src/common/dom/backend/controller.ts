import type {ServicesForBackendController} from '~/common/backend';
import {STATIC_CONFIG} from '~/common/config';
import type {DeviceIds} from '~/common/device';
import {
    BackendCreationError,
    type OppfFetchConfig,
    type BackendCreator,
    type DeviceLinkingSetup,
    type LinkingState,
    type BackendHandle,
    type BackendInit,
    type LoadingState,
    type LoadingStateSetup,
    type CertificatePinRecoveryHandle,
    type LinkingStateErrorType,
    type OnboardingFlow,
    type StandaloneIdentitySetup,
    type StandaloneOnboardingMode,
    type SafeRestoreCredentials,
    type SafeBackupRequest,
    type SafeBackupOutcome,
} from '~/common/dom/backend';
import type {IFrontendElectronService} from '~/common/electron-service';
import type {ConnectionState, D2mLeaderState} from '~/common/enum';
import {extractErrorMessage} from '~/common/error';
import {RELEASE_PROXY, TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {IFrontendMediaService} from '~/common/media';
import type {ProfilePictureView} from '~/common/model';
import type {DisplayPacket} from '~/common/network/protocol/capture';
import {getClientInfo} from '~/common/network/protocol/task/libthreema/utils';
import {ensureIdentityString, type IdentityString} from '~/common/network/types';
import type {NotificationCreator} from '~/common/notification';
import type {SystemDialogService} from '~/common/system-dialog';
import type {TestDataJson} from '~/common/test-data';
import {assertError, assertUnreachable, ensureError, unreachable} from '~/common/utils/assert';
import type {ResettableDelayed} from '~/common/utils/delayed';
import {PROXY_HANDLER, type RemoteProxy, type ProxyEndpoint} from '~/common/utils/endpoint';
import {ReusablePromise, eternalPromise} from '~/common/utils/promise';
import {ResolvablePromise} from '~/common/utils/resolvable-promise';
import {
    type IQueryableStore,
    type ReadableStore,
    type RemoteStore,
    WritableStore,
} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import type {WebRtcService} from '~/common/webrtc';

export interface UserData {
    readonly identity: IdentityString;
    readonly profilePicture: RemoteStore<ProfilePictureView>;
}

/**
 * Map a {@link BackendCreationError} type raised during standalone onboarding to the wizard's
 * {@link LinkingStateErrorType} so the linking error screen can render it.
 */
function standaloneLinkingErrorType(type: BackendCreationError['type']): LinkingStateErrorType {
    switch (type) {
        case 'fetch-oppf-error':
        case 'invalid-oppf':
        case 'verify-oppf-file-error':
        case 'update-onprem-config-error':
        case 'update-public-key-pins-error':
            return {kind: 'onprem-configuration-error'};
        case 'no-identity':
            return {kind: 'registration-error'};
        default:
            return {kind: 'generic-error'};
    }
}

/**
 * Essential data required to be available for startup (of the UI).
 */
interface EssentialStartupData {
    readonly connectionState: RemoteStore<ConnectionState>;
    readonly deviceIds: DeviceIds;
    readonly leaderState: RemoteStore<D2mLeaderState>;
    readonly user: UserData;
}

/**
 * The backend controller takes the remote {@link BackendHandle} and establishes the
 * communication link between worker and UI thread.
 *
 * The backend controller instance itself lives in the UI thread.
 */
export class BackendController {
    public readonly connectionState: EssentialStartupData['connectionState'];
    public readonly deviceIds: EssentialStartupData['deviceIds'];
    public readonly leaderState: EssentialStartupData['leaderState'];
    public readonly user: EssentialStartupData['user'];

    public readonly connectionManager: RemoteProxy<BackendHandle>['connectionManager'];
    public readonly debug: RemoteProxy<BackendHandle>['debug'];
    public readonly directory: RemoteProxy<BackendHandle>['directory'];
    public readonly flushPendingOutgoing: RemoteProxy<BackendHandle>['flushPendingOutgoing'];
    public readonly keyStorage: RemoteProxy<BackendHandle>['keyStorage'];
    public readonly linkPreview: RemoteProxy<BackendHandle>['linkPreview'];
    public readonly onSystemSuspend: RemoteProxy<BackendHandle>['onSystemSuspend'];
    public readonly model: RemoteProxy<BackendHandle>['model'];
    public readonly viewModel: RemoteProxy<BackendHandle>['viewModel'];
    public readonly work: RemoteProxy<BackendHandle>['work'];

    public capturing?: {
        readonly packets: IQueryableStore<readonly DisplayPacket[]>;
        readonly stop: () => void;
    };

    public constructor(
        private readonly _log: Logger,
        private readonly _remote: RemoteProxy<BackendHandle>,

        data: EssentialStartupData,
    ) {
        this.connectionState = data.connectionState;
        this.deviceIds = data.deviceIds;
        this.leaderState = data.leaderState;
        this.user = data.user;

        this.connectionManager = _remote.connectionManager;
        this.debug = _remote.debug;
        this.directory = _remote.directory;
        this.flushPendingOutgoing = _remote.flushPendingOutgoing;
        this.keyStorage = _remote.keyStorage;
        this.linkPreview = _remote.linkPreview;
        this.model = _remote.model;
        this.onSystemSuspend = _remote.onSystemSuspend;
        this.viewModel = _remote.viewModel;
        this.work = _remote.work;
    }

    public static async create(
        oldProfilePath: string | undefined,
        services: ServicesForBackendController,
        creator: RemoteProxy<BackendCreator>,
        loadingStateStore: WritableStore<LoadingState, LoadingState>,
        testData: TestDataJson | undefined,
        passwordForExistingKeyStorage: string | undefined,
        certificatePinRecoveryHandle: ResettableDelayed<RemoteProxy<CertificatePinRecoveryHandle>>,
        invalidCertificatePinStore: WritableStore<boolean>,
        showLinkingWizard: (
            linkingStateStore: ReadableStore<LinkingState>,
            userPassword: ResolvablePromise<string>,
            shouldStorePassword: ResolvablePromise<boolean>,
            oldProfilePassword: ReusablePromise<string | undefined>,
            continueWithoutRestoring: ResolvablePromise<void>,
            oppfConfig: ResolvablePromise<OppfFetchConfig>,
            invalidCertificatePinStore: WritableStore<boolean>,
            standaloneMode: ResolvablePromise<StandaloneOnboardingMode>,
            safeRestoreCredentials: ResolvablePromise<SafeRestoreCredentials>,
            safeBackupRequest: ResolvablePromise<SafeBackupRequest | undefined>,
            safeBackupResult: ReadableStore<SafeBackupOutcome | undefined>,
            displayName: ResolvablePromise<string | undefined>,
            onboardingFlow: ResolvablePromise<OnboardingFlow>,
        ) => Promise<void>,
        requestUserPassword: (
            shouldStorePassword: ResolvablePromise<boolean>,
            previouslyAttemptedPassword?: string,
        ) => Promise<string>,
        storeUserPassword: (password: string) => Promise<boolean>,
        requestMissingWorkCredentialsModal: () => Promise<void>,
        requestMissingCachedOnPremConfigModal: () => Promise<void>,
        requestKeyStorageMigrationFailedModal: () => Promise<void>,
        requestInvalidCredentialPinsModal: (
            password: string,
            waitForAppAttached: boolean,
            backendCreationError?: BackendCreationError,
        ) => Promise<boolean>,
    ): Promise<[controller: BackendController, identityIsReady: boolean]> {
        const {endpoint, logging} = services;
        const log = logging.logger('backend-controller');

        /**
         * Helper function to assemble a {@link BackendInit} object.
         */
        function assembleBackendInit(): BackendInit {
            // Launcher
            const {local: localElectronEndpoint, remote: electronEndpoint} =
                endpoint.createEndpointPair<IFrontendElectronService>();
            endpoint.exposeProxy(
                services.electron,
                localElectronEndpoint,
                logging.logger('com.electron'),
            );

            // Media
            const {local: localMediaEndpoint, remote: mediaEndpoint} =
                endpoint.createEndpointPair<IFrontendMediaService>();
            endpoint.exposeProxy(services.media, localMediaEndpoint, logging.logger('com.media'));

            // Notifications
            const {local: localNotificationEndpoint, remote: notificationEndpoint} =
                endpoint.createEndpointPair<NotificationCreator>();
            endpoint.exposeProxy(
                services.notification,
                localNotificationEndpoint,
                logging.logger('com.notification'),
            );

            // System dialog
            const {local: localSystemDialogEndpoint, remote: systemDialogEndpoint} =
                endpoint.createEndpointPair<SystemDialogService>();
            endpoint.exposeProxy(
                services.systemDialog,
                localSystemDialogEndpoint,
                logging.logger('com.system-dialog'),
            );

            // WebRTC
            const {local: localWebRtcEndpoint, remote: webRtcEndpoint} =
                endpoint.createEndpointPair<WebRtcService>();
            endpoint.exposeProxy(
                services.webRtc,
                localWebRtcEndpoint,
                logging.logger('com.webrtc'),
            );

            // Transfer
            return endpoint.transfer(
                {
                    electronEndpoint,
                    mediaEndpoint,
                    notificationEndpoint,
                    systemDialogEndpoint,
                    webRtcEndpoint,
                    systemInfo: services.systemInfo,
                },
                [
                    electronEndpoint,
                    mediaEndpoint,
                    notificationEndpoint,
                    systemDialogEndpoint,
                    webRtcEndpoint,
                ],
            );
        }

        function assembleLoadingStateSetup(
            loadingStateStore_: WritableStore<LoadingState>,
        ): ProxyEndpoint<LoadingStateSetup> {
            const {local, remote} = endpoint.createEndpointPair<LoadingStateSetup>();

            // Add transfer markers
            const loadingStateSetup: LoadingStateSetup = {
                loadingState: {
                    store: loadingStateStore_,
                    updateState: (state: LoadingState) => {
                        loadingStateStore_.set(state);
                    },
                    [TRANSFER_HANDLER]: PROXY_HANDLER,
                },
                [TRANSFER_HANDLER]: PROXY_HANDLER,
            };

            // Expose
            endpoint.exposeProxy(loadingStateSetup, local, logging.logger('com.loading-screen'));

            // Transfer
            return endpoint.transfer(remote, [remote]);
        }

        function assembleDeviceLinkingSetup(
            linkingStateStore_: WritableStore<LinkingState>,
            userPassword: Promise<string>,
            oldProfilePassword: ReusablePromise<string | undefined>,
            continueWithoutRestoring: Promise<void>,
            oppfConfig: Promise<OppfFetchConfig>,
        ): ProxyEndpoint<DeviceLinkingSetup> {
            const {local, remote} = endpoint.createEndpointPair<DeviceLinkingSetup>();

            // Add transfer markers
            const deviceLinkingSetup: DeviceLinkingSetup = {
                linkingState: {
                    store: linkingStateStore_,
                    updateState: (state: LinkingState) => {
                        linkingStateStore_.set(state);
                    },
                    [TRANSFER_HANDLER]: PROXY_HANDLER,
                },
                userPassword,
                oldProfilePassword,
                continueWithoutRestoring,
                oppfConfig,
                [TRANSFER_HANDLER]: PROXY_HANDLER,
            };

            // Expose
            endpoint.exposeProxy(deviceLinkingSetup, local, logging.logger('com.device-linking'));

            // Transfer
            return endpoint.transfer(remote, [remote]);
        }

        // Create backend from existing key storage (if present).
        log.debug('Waiting for remote backend to be created');
        let shouldStorePassword = new ResolvablePromise<boolean>({uncaught: 'default'});
        let identityIsReady = false;
        let backendEndpoint;

        // Create backend from test profile if it was requested and does not exist yet.
        if (import.meta.env.BUILD_MODE === 'testing') {
            try {
                await creator.fromTestConfiguration(
                    assembleBackendInit(),
                    getClientInfo(services),
                    testData,
                );
                identityIsReady = true;
            } catch (error) {
                assertError(
                    error,
                    BackendCreationError,
                    'Backend creator threw an unexpected error',
                );
                const errorMessage = extractErrorMessage(ensureError(error), 'short');
                throw new Error(`Unexpected error type: ${error.type} (${errorMessage})`);
            }
        }

        if (await creator.hasIdentity()) {
            // If this is a remote secret system suspension restart, show a dialog disabling direct
            // login.
            if (
                passwordForExistingKeyStorage !== undefined &&
                services.electron.remoteSecretSystemSuspensionRestartParameter()
            ) {
                const handle = services.systemDialog.open({type: 'remote-secrets-system-suspend'});
                await handle.closed;
            }

            // If a remote secret error ocurred that forced a restart, pretend there is no password
            // in the keychain to show the correct error message.
            if (
                passwordForExistingKeyStorage !== undefined &&
                services.electron.getRemoteSecretLaunchParameter() !== undefined
            ) {
                passwordForExistingKeyStorage = undefined;
            }

            // eslint-disable-next-line no-labels
            loopToCreateBackendWithKeyStorage: for (;;) {
                log.debug('Loop to create backend with existing key storage');
                const password =
                    passwordForExistingKeyStorage ??
                    (await requestUserPassword(shouldStorePassword));

                // Create a fresh recovery endpoint pair for each attempt, because
                // MessagePorts are neutered after being transferred to the worker
                // and cannot be reused on retry (e.g. after a wrong password).
                const {local: localRecoveryEndpoint, remote: remoteRecoveryEndpoint} =
                    endpoint.createEndpointPair<CertificatePinRecoveryHandle>();
                const wrappedRecoveryHandle = endpoint.wrap<CertificatePinRecoveryHandle>(
                    localRecoveryEndpoint,
                    logging.logger('com.certificate-pin-recovery'),
                );

                // Publish the handle before `fromKeyStorage` so it is available
                // when the `registerInvalidCertificatePins` callback or the catch
                // block shows the recovery dialog during backend creation.
                certificatePinRecoveryHandle.set(wrappedRecoveryHandle);

                services.electron.registerInvalidCertificatePins(async () => {
                    invalidCertificatePinStore.set(true);
                    const isRemoteSecretActive = await requestInvalidCredentialPinsModal(
                        password,
                        // Because this handler might be called after this `BackendController` was
                        // already created, we need to ensure that the modal is attached after the
                        // app UI is mounted to prevent a race condition where the app mount
                        // replaces the mounted dialog.
                        true,
                    );

                    if (isRemoteSecretActive) {
                        await services.electron.signalRestartReady();
                    } else {
                        services.electron.restartApp();
                    }
                });

                try {
                    backendEndpoint = await creator.fromKeyStorage(
                        assembleBackendInit(),
                        password,
                        assembleLoadingStateSetup(loadingStateStore),
                        endpoint.transfer(remoteRecoveryEndpoint, [remoteRecoveryEndpoint]),
                    );
                    identityIsReady = true;

                    if (shouldStorePassword.done && (await shouldStorePassword)) {
                        await storeUserPassword(password);
                    }
                } catch (error) {
                    assertError(
                        error,
                        BackendCreationError,
                        'Backend creator threw an unexpected error',
                    );
                    const errorMessage = extractErrorMessage(ensureError(error), 'short');
                    switch (error.type) {
                        case 'update-public-key-pins-error':
                        case 'update-onprem-config-error':
                        case 'fetch-oppf-error':
                        case 'invalid-oppf':
                        case 'verify-oppf-file-error': {
                            const isRemoteSecretActive = await requestInvalidCredentialPinsModal(
                                password,
                                // Do not wait for app mount, because this would result in a
                                // deadlock where the app waits for `BackendController` to be
                                // created before mounting, while we wait for the app to mount here
                                // (during creation of the `BackendController`).
                                false,
                                error,
                            );

                            // eslint-disable-next-line max-depth
                            if (isRemoteSecretActive) {
                                // Signal readiness so any pending `beforeRestart()` (waiting on
                                // pre-restart tasks triggered by the invalid-pins flow) can unblock
                                // and drive the actual restart.
                                await services.electron.signalRestartReady();
                            } else {
                                services.electron.restartApp();
                            }

                            // Wait for the main process to exit the app. Returning here would race
                            // with `electron.app.exit()`.
                            return unreachable(await eternalPromise());
                        }
                        case 'missing-oppf-url':
                            // Backend cannot be created because no OPPF URL was found.
                            // Carry on, the device linking logic will happen below.
                            log.debug('Backend could not be created, no OPPF URL found');
                            // eslint-disable-next-line no-labels
                            break loopToCreateBackendWithKeyStorage;
                        case 'missing-cached-onprem-config':
                            // Backend cannot be created because the cached OPPF needed to apply
                            // pins before Remote Secret fetch is unavailable (Gen 2 + RS active).
                            // Force the user to re-link via a blocking modal.
                            log.debug(
                                'Backend could not be created, no cached OPPF available for RS-protected inner; prompting re-link',
                            );
                            await requestMissingCachedOnPremConfigModal();
                            return assertUnreachable(
                                'Cannot continue process without cached OnPrem config',
                            );
                        case 'no-identity':
                            // Backend cannot be created because no identity was found.
                            // Carry on, the device linking logic will happen below.
                            log.debug('Backend could not be created, no identity found');
                            // eslint-disable-next-line no-labels
                            break loopToCreateBackendWithKeyStorage;
                        case 'key-storage-error':
                            throw new Error(
                                `TODO(DESK-383): handle key storage error (${errorMessage})`,
                            );
                        case 'key-storage-migration-error':
                            // The only way out of this dialog is closing the app so we just wait indefinitely.
                            await requestKeyStorageMigrationFailedModal();
                            break;
                        case 'key-storage-error-wrong-password':
                            log.debug('Backend could not be created, wrong key storage password');
                            shouldStorePassword = new ResolvablePromise<boolean>({
                                uncaught: 'default',
                            });
                            passwordForExistingKeyStorage = await requestUserPassword(
                                shouldStorePassword,
                                password,
                            );
                            continue;
                        case 'missing-work-credentials':
                            log.debug(
                                'Backend could not be created, no WorkData present in work or onprem build',
                            );
                            await requestMissingWorkCredentialsModal();
                            return assertUnreachable('Cannot continue process without work data');
                        case 'invalid-environment':
                        case 'remote-secret-error':
                        case 'handled-linking-error':
                            throw new Error(
                                `Unexpected error type: ${error.type} (${errorMessage})`,
                            );
                        default:
                            unreachable(error.type);
                    }
                }
                break;
            }
        }

        // If backend could not be created, that means that no identity was found. Initiate device
        // linking flow.
        if (backendEndpoint === undefined) {
            log.debug('Starting device linking process');

            const shouldRestoreOldMessages = oldProfilePath !== undefined;
            // Store containing the backend's linking state
            const linkingStateStore = new WritableStore<LinkingState>({
                state: 'initializing',
            });

            // Note: `oppfConfig` will never resolve in non OnPrem builds.
            const oppfConfig = new ResolvablePromise<OppfFetchConfig>({uncaught: 'default'});
            const userPassword = new ResolvablePromise<string>({uncaught: 'default'});
            const oldProfilePassword = new ReusablePromise<string | undefined>();
            const continueWithoutRestoring = new ResolvablePromise<void>({uncaught: 'default'});
            const standaloneMode = new ResolvablePromise<StandaloneOnboardingMode>({
                uncaught: 'default',
            });
            // Top-level flow choice (custom-onprem only): the wizard's initial mode selector
            // resolves this BEFORE any bootstrap branch is committed.
            const onboardingFlow = new ResolvablePromise<OnboardingFlow>({
                uncaught: 'default',
            });
            const safeRestoreCredentials = new ResolvablePromise<SafeRestoreCredentials>({
                uncaught: 'default',
            });
            // Resolved (with credentials, or `undefined` if the user skips) during the create flow,
            // before the identity is created — so the backup can be written inline (T10, Option A).
            const safeBackupRequest = new ResolvablePromise<SafeBackupRequest | undefined>({
                uncaught: 'default',
            });
            // Outcome of the best-effort inline Safe backup (create flow); the success screen reads
            // it so a silent backup failure is not a data-loss trap. `undefined` until known / when
            // no backup was requested.
            const safeBackupResult = new WritableStore<SafeBackupOutcome | undefined>(undefined);
            // Resolved (with the chosen display name, or `undefined` if the user skips) during the
            // create flow, before the identity is created — so the nickname can be pre-seeded into
            // the freshly-created profile settings.
            const displayName = new ResolvablePromise<string | undefined>({
                uncaught: 'default',
            });
            // Show linking screen
            await showLinkingWizard(
                linkingStateStore,
                userPassword,
                shouldStorePassword,
                oldProfilePassword,
                continueWithoutRestoring,
                oppfConfig,
                invalidCertificatePinStore,
                standaloneMode,
                safeRestoreCredentials,
                safeBackupRequest,
                safeBackupResult,
                displayName,
                onboardingFlow,
            );

            // Stock device-join bootstrap, shared by the non-custom-onprem flavors and the
            // custom-onprem "link with phone" flow choice. Extraction of the previous `else`
            // body; no behavior change. Returns the created backend endpoint.
            async function runDeviceJoin(): Promise<ProxyEndpoint<BackendHandle>> {
                // Create backend through device join
                try {
                    const {local: localRecoveryEndpoint, remote: remoteRecoveryEndpoint} =
                        endpoint.createEndpointPair<CertificatePinRecoveryHandle>();
                    const wrappedRecoveryHandle = endpoint.wrap<CertificatePinRecoveryHandle>(
                        localRecoveryEndpoint,
                        logging.logger('com.certificate-pin-recovery'),
                    );

                    // Publish the handle before `fromDeviceJoin` so it is available
                    // if cert pin recovery is needed during backend creation.
                    certificatePinRecoveryHandle.set(wrappedRecoveryHandle);

                    const joinedBackendEndpoint = await creator.fromDeviceJoin(
                        assembleBackendInit(),
                        assembleDeviceLinkingSetup(
                            linkingStateStore,
                            userPassword,
                            oldProfilePassword,
                            continueWithoutRestoring,
                            oppfConfig,
                        ),
                        shouldRestoreOldMessages,
                        endpoint.transfer(remoteRecoveryEndpoint, [remoteRecoveryEndpoint]),
                    );

                    return joinedBackendEndpoint;
                } catch (error) {
                    assertError(
                        error,
                        BackendCreationError,
                        'Backend creator threw an unexpected error',
                    );
                    switch (error.type) {
                        case 'handled-linking-error':
                            log.warn(
                                'Encountered a linking error that is handled by the UI. Waiting for application restart.',
                            );
                            return unreachable(await eternalPromise());
                        case 'no-identity':
                            throw new Error(
                                `Unexpected error type: ${error.type} (${extractErrorMessage(
                                    error,
                                    'short',
                                )})`,
                            );
                        case 'key-storage-error':
                            throw new Error(
                                `TODO(DESK-383): handle key storage error (${extractErrorMessage(
                                    error,
                                    'short',
                                )}`,
                            );
                        case 'fetch-oppf-error':
                        case 'invalid-oppf':
                        case 'missing-oppf-url':
                        case 'missing-cached-onprem-config':
                        case 'update-onprem-config-error':
                        case 'update-public-key-pins-error':
                        case 'verify-oppf-file-error':
                        case 'invalid-environment':
                        case 'key-storage-migration-error':
                        case 'key-storage-error-wrong-password':
                        case 'missing-work-credentials':
                        case 'remote-secret-error':
                            throw new Error(
                                `Unexpected error type: ${error.type} (${extractErrorMessage(
                                    error,
                                    'short',
                                )})`,
                            );
                        default:
                            return unreachable(error.type);
                    }
                }
            }

            if (
                import.meta.env.BUILD_FLAVOR === 'custom-onprem' &&
                (await onboardingFlow) === 'standalone'
            ) {
                // Standalone (self-hosted) onboarding: self-generate a new Threema identity, or
                // restore an existing one from a Threema Safe backup. The user chose this flow on
                // the wizard's initial mode selector; "link with phone" runs the stock device-join
                // below instead.
                const mode = await standaloneMode;
                const resolvedOppfConfig = await oppfConfig;
                const keyStoragePassword = await userPassword;

                let setup: StandaloneIdentitySetup;
                if (mode === 'safe-restore') {
                    const credentials = await safeRestoreCredentials;
                    setup = {
                        oppfConfig: resolvedOppfConfig,
                        keyStoragePassword,
                        mode: 'restore',
                        safeRestore: {
                            identity: ensureIdentityString(credentials.identity),
                            password: credentials.password,
                            ...(credentials.customSafeServerUrl === undefined
                                ? {}
                                : {customSafeServerUrl: credentials.customSafeServerUrl}),
                        },
                    };
                } else {
                    // Create flow: await the (optional) onboarding display name and Safe-backup
                    // opt-in. The display name is collected first (set-display-name step), then the
                    // backup so it can be written inline while the raw client key is in hand (T10,
                    // Option A).
                    const name = await displayName;
                    const backupRequest = await safeBackupRequest;
                    setup = {
                        oppfConfig: resolvedOppfConfig,
                        keyStoragePassword,
                        mode: 'create',
                        ...(name === undefined ? {} : {displayName: name}),
                        ...(backupRequest === undefined ? {} : {safeBackup: backupRequest}),
                    };
                }

                linkingStateStore.set({
                    state: 'syncing',
                    phase: mode === 'safe-restore' ? 'restoring' : 'encrypting',
                });

                // Create the key storage for the self-generated / restored identity.
                let backupOutcome: SafeBackupOutcome | undefined;
                let createdIdentity: IdentityString;
                try {
                    const standaloneResult = await creator.fromStandaloneIdentity(
                        assembleBackendInit(),
                        getClientInfo(services),
                        setup,
                    );
                    backupOutcome = standaloneResult.safeBackupOutcome;
                    createdIdentity = standaloneResult.identity;
                } catch (error) {
                    assertError(
                        error,
                        BackendCreationError,
                        'Backend creator threw an unexpected error',
                    );
                    linkingStateStore.set({
                        state: 'error',
                        type: standaloneLinkingErrorType(error.type),
                        message: extractErrorMessage(error, 'short'),
                    });
                    return unreachable(await eternalPromise());
                }

                // The key storage now exists; start the backend from it without re-prompting for
                // the password (already collected by the wizard).
                const {local: localRecoveryEndpoint, remote: remoteRecoveryEndpoint} =
                    endpoint.createEndpointPair<CertificatePinRecoveryHandle>();
                const wrappedRecoveryHandle = endpoint.wrap<CertificatePinRecoveryHandle>(
                    localRecoveryEndpoint,
                    logging.logger('com.certificate-pin-recovery'),
                );
                certificatePinRecoveryHandle.set(wrappedRecoveryHandle);
                try {
                    backendEndpoint = await creator.fromKeyStorage(
                        assembleBackendInit(),
                        keyStoragePassword,
                        assembleLoadingStateSetup(loadingStateStore),
                        endpoint.transfer(remoteRecoveryEndpoint, [remoteRecoveryEndpoint]),
                    );
                } catch (error) {
                    assertError(
                        error,
                        BackendCreationError,
                        'Backend creator threw an unexpected error',
                    );
                    linkingStateStore.set({
                        state: 'error',
                        type: {kind: 'generic-error'},
                        message: extractErrorMessage(error, 'short'),
                    });
                    return unreachable(await eternalPromise());
                }

                if (await shouldStorePassword) {
                    await storeUserPassword(keyStoragePassword);
                }

                // Surface the inline Safe-backup outcome before the success screen renders.
                safeBackupResult.set(backupOutcome);

                // Signal success: the wizard shows its success screen and resolves `identityReady`
                // (which gates app attachment); `identityIsReady` stays false here. The created /
                // restored identity rides along so the success screen can show it to the user.
                linkingStateStore.set({state: 'registered', identity: createdIdentity});
            } else {
                // Non-custom flavors, and the custom-onprem "link with phone" flow choice. The
                // password-store step lives here (not in `runDeviceJoin`) so the closure never
                // captures the reassignable `shouldStorePassword` parameter.
                backendEndpoint = await runDeviceJoin();

                if (await shouldStorePassword) {
                    const password = await userPassword;
                    await storeUserPassword(password);
                }
            }
        }

        // Wrap backend endpoint
        const remote = endpoint.wrap<BackendHandle>(backendEndpoint, logging.logger('com.backend'));

        // Release the one-shot backend creator
        creator[RELEASE_PROXY]();

        // Gather startup data
        log.debug('Waiting for startup data to be available');
        const [connectionState, leaderState, identity, deviceIds, profilePicture] =
            await Promise.all([
                remote.connectionManager.state,
                remote.connectionManager.leaderState,
                remote.model.user.identity,
                remote.deviceIds,
                remote.model.user.profilePicture,
            ]);
        // Done
        log.debug('Creating backend controller');
        const backend = new BackendController(log, remote, {
            deviceIds,
            connectionState,
            leaderState,
            user: {identity, profilePicture},
        });

        return [backend, identityIsReady];
    }

    /**
     * Trigger capturing network packets to be displayed in the debug network tab.
     */
    public async capture(): Promise<void> {
        this._log.info('Starting to capture packets');

        // TODO(DESK-63): This functionality should be untangled and moved into the `DebugBackend`

        // Nothing to do if already capturing
        if (this.capturing !== undefined) {
            return;
        }

        const debugHistoryLenggth = STATIC_CONFIG.DEBUG_PACKET_CAPTURE_HISTORY_LENGTH;

        // Push sequential packets into a bounded array.
        //
        // TODO(DESK-688): We should not use a plain array for the store as the comparison on each
        // pushed packet will likely lead to significant CPU cost.
        const packets: DisplayPacket[] = [];
        const store = derive([await this._remote.capture()], ([{currentValue: packet}]) => {
            if (packet === undefined) {
                return packets;
            }
            packets.push(packet);
            if (packets.length > debugHistoryLenggth) {
                packets.shift();
            }
            // Note: We need to clone the `packets` array, so the diffing
            //       algorithm of Svelte works!
            return [...packets];
        });

        // Add a no-op subscriber so the packets are gathered before the
        // packets are being displayed.
        const unsubscribe = store.subscribe(() => {});
        this.capturing = {
            packets: store,
            stop: (): void => {
                unsubscribe();
                this.capturing = undefined;
            },
        };
    }
}

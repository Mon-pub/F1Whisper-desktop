import type {ClientInfo, ConfigEnvironment, Flavor} from '@threema/libthreema-wasm';
import {NonceScope} from '@threema/protocol/enum';
import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
import {base64ToU8a} from '@threema/ts-utils/base64/base64-to-u8a';
import {bytesToHex} from '@threema/ts-utils/byte/bytes-to-hex';
import {hexToBytes} from '@threema/ts-utils/byte/hex-to-bytes';
import {UTF8} from '@threema/ts-utils/codec/utf8';
import {ensureU53, type u53} from '@threema/ts-utils/integer/u53';
import {ensureU8} from '@threema/ts-utils/integer/u8';
import {ensureError} from '@threema/ts-utils/meta/ensure-error';
import {dateToUnixTimestampMs} from '@threema/ts-utils/number/date-to-unix-timestamp-ms';
import {u64ToHexLe} from '@threema/ts-utils/number/u64-to-hex-le';
import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';

import type {
    EarlyBackendServices,
    EarlyBackendServicesThatDontRequireConfig,
    EarlyBackendServicesThatRequireConfig,
    ServicesForBackend,
} from '~/common/backend';
import {BackgroundJobScheduler} from '~/common/background-job-scheduler';
import type {Compressor} from '~/common/compressor';
import {
    type Config,
    createConfigFromOppf,
    createDefaultConfig,
    createOnPremConfigFromOppf,
    STATIC_CONFIG,
} from '~/common/config';
import {SecureSharedBoxFactory} from '~/common/crypto/box';
import {NonceService} from '~/common/crypto/nonce';
import {randomU64} from '~/common/crypto/random';
import {TweetNaClBackend} from '~/common/crypto/tweetnacl';
import {
    DATABASE_KEY_LENGTH,
    type DatabaseBackend,
    type RawDatabaseKey,
    type ServicesForDatabaseFactory,
    wrapRawDatabaseKey,
} from '~/common/db';
import {
    DeviceBackend,
    type DeviceIds,
    type IdentityData,
    type ThreemaWorkData,
} from '~/common/device';
import {
    assertOwnFeatureMaskJob,
    autoUpdateCheckJob,
    workLicenseCheckJob,
    workSyncJob,
} from '~/common/dom/backend/background-jobs';
import {DisappearingMessageService} from '~/common/dom/backend/disappearing-message-service';
import {DisappearingTimerReassertService} from '~/common/dom/backend/disappearing-timer-reassert-service';
import {BackendCreationError} from '~/common/dom/backend/errors';
import {DeviceJoinProtocol, type DeviceJoinResult} from '~/common/dom/backend/join';
import * as oppf from '~/common/dom/backend/onprem/oppf';
import {OPPF_FILE_SCHEMA} from '~/common/dom/backend/onprem/oppf';
import {OutgoingMessageOutboxRecoveryService} from '~/common/dom/backend/outgoing-message-outbox-recovery-service';
import {
    activateRemoteSecret,
    handleRemoteSecretMdmParameterChange,
} from '~/common/dom/backend/remote-secret';
import {
    OldProfileRestorationUnavailableError,
    unlockDatabaseKey,
    transferOldMessages,
} from '~/common/dom/backend/restore-db';
import {recoverCertificatePins} from '~/common/dom/backend/spki';
import {UserProfilePictureDistributionRetryService} from '~/common/dom/backend/user-profile-picture-distribution-retry-service';
import {randomBytes} from '~/common/dom/crypto/random';
import {DebugBackend} from '~/common/dom/debug';
import {LinkPreviewBackendImpl} from '~/common/dom/network/link-preview/backend';
import type {LinkPreviewBackend} from '~/common/dom/network/link-preview/types';
import {ConnectionManager} from '~/common/dom/network/protocol/connection';
import {FetchBlobBackend} from '~/common/dom/network/protocol/fetch-blob';
import {FetchDirectoryBackend} from '~/common/dom/network/protocol/fetch-directory';
import {FetchSfuHttpBackend} from '~/common/dom/network/protocol/fetch-sfu';
import {FetchWorkBackend} from '~/common/dom/network/protocol/fetch-work';
import {
    RendezvousConnection,
    type RendezvousProtocolSetup,
} from '~/common/dom/network/protocol/rendezvous';
import {downloadSafeBackup, type SafeBackupData, type SafeCredentials} from '~/common/dom/safe';
import {uploadSafeBackup} from '~/common/dom/safe/create-backup';
import type {SystemInfo} from '~/common/electron-ipc';
import type {IFrontendElectronService} from '~/common/electron-service';
import {CloseCodeUtils, D2mLeaderState, WorkAvailabilityStatusCategory} from '~/common/enum';
import {
    DeviceJoinError,
    extractErrorTraceback,
    RendezvousCloseError,
    extractErrorMessage,
} from '~/common/error';
import type {FileStorage, ServicesForFileStorageFactory} from '~/common/file-storage';
import {TRANSFER_HANDLER} from '~/common/index';
import type {ThreemaWorkCredentials} from '~/common/internal-protobuf/key-storage-file';
import type {
    KeyStorage,
    KeyStorageInitOverrides,
    KeyStorageIntermediateDecodeHandler,
    KeyStorageOnPremConfigStoreData,
    KeyStorageRemoteSecretWriteData,
    KeyStorageWorkCredentialsStoreData,
    LatestKeyStorageLayers,
    ServicesForKeyStorageFactory,
} from '~/common/key-storage';
import {KeyStorageError} from '~/common/key-storage/common';
import {LoadingInfo} from '~/common/loading';
import type {Logger, LoggerFactory} from '~/common/logging';
import {getAndParseMdm} from '~/common/mdm';
import {BackendMediaService, type IFrontendMediaService} from '~/common/media';
import type {Repositories} from '~/common/model';
import {getOutgoingPreparationLane} from '~/common/model/f1-outgoing-preparation-lane';
import {stopOutgoingUploads} from '~/common/model/f1-outgoing-shutdown';
import {ModelRepositories} from '~/common/model/repositories';
import {
    type DisplayPacket,
    type PacketMeta,
    RAW_CAPTURE_CONVERTER,
    type RawCaptureHandlers,
    type RawPacket,
} from '~/common/network/protocol/capture';
import {type DirectoryBackend, DirectoryError} from '~/common/network/protocol/directory';
import {PersistentProtocolStateBackend} from '~/common/network/protocol/persistent-protocol-state';
import type {RendezvousCloseCause} from '~/common/network/protocol/rendezvous';
import {
    RemoteSecretMonitoringProtocolBackend,
    StubRemoteSecretMonitoringProtocolBackend,
    type RemoteSecretMonitoringBase,
} from '~/common/network/protocol/task/libthreema/remote-secret-monitor';
import {TaskManager} from '~/common/network/protocol/task/manager';
import {VolatileProtocolStateBackend} from '~/common/network/protocol/volatile-protocol-state';
import {StubWorkBackend, type WorkBackend} from '~/common/network/protocol/work';
import {
    ensureBaseUrl,
    ensureCspDeviceId,
    ensureD2mDeviceId,
    ensureDeviceCookie,
    ensureIdentityString,
    ensureNickname,
    ensureServerGroup,
    type DeviceCookie,
    type IdentityString,
    type ServerGroup,
} from '~/common/network/types';
import {
    type ClientKey,
    randomRendezvousAuthenticationKey,
    type RawClientKey,
    type RawDeviceGroupKey,
    wrapRawClientKey,
    wrapRawDeviceGroupKey,
} from '~/common/network/types/keys';
import type {DbMigrationSupplements} from '~/common/node/db/migrations';
import type {TempFileSystemFileStorage} from '~/common/node/file-storage/temp-system-file-storage';
import {type NotificationCreator, NotificationService} from '~/common/notification';
import type {SystemDialogService} from '~/common/system-dialog';
import {generateTestData, runIdentityCreate, type TestDataJson} from '~/common/test-data';
import {assert, assertError, assertUnreachable, unreachable, unwrap} from '~/common/utils/assert';
import {
    type EndpointService,
    PROXY_HANDLER,
    type ProxyMarked,
    type Remote,
    type ProxyEndpoint,
} from '~/common/utils/endpoint';
import {EventController} from '~/common/utils/event';
import {Identity} from '~/common/utils/identity';
import {eternalPromise, taggedRace, type ReusablePromise} from '~/common/utils/promise';
import {
    type LocalStore,
    type StoreDeactivator,
    WritableStore,
    type IQueryableStore,
    type IWritableStore,
} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import {ensureStoreValue} from '~/common/utils/store/helpers';
import {type IViewModelRepository, ViewModelRepository} from '~/common/viewmodel';
import {ViewModelCache} from '~/common/viewmodel/cache';
import type {WebRtcService} from '~/common/webrtc';

/**
 * Data required to be supplied to a backend worker for initialisation.
 */
export interface BackendInit {
    readonly electronEndpoint: ProxyEndpoint<IFrontendElectronService>;
    readonly mediaEndpoint: ProxyEndpoint<IFrontendMediaService>;
    readonly notificationEndpoint: ProxyEndpoint<NotificationCreator>;
    readonly systemDialogEndpoint: ProxyEndpoint<SystemDialogService>;
    readonly webRtcEndpoint: ProxyEndpoint<WebRtcService>;
    readonly systemInfo: SystemInfo;
}

/**
 * Interface exposed by the worker towards the backend controller. It is used to instantiate the
 * backend in the context of the worker.
 */
export interface BackendCreator extends ProxyMarked {
    /** Return whether or not an identity (i.e. a key storage file) is present. */
    readonly hasIdentity: () => boolean;

    /** Instantiate backend from an existing key storage. */
    readonly fromKeyStorage: (
        init: Remote<BackendInit>,
        userPassword: string,
        loadingStateSetup: ProxyEndpoint<LoadingStateSetup>,
        certificatePinRecoveryEndpoint: ProxyEndpoint<CertificatePinRecoveryHandle>,
    ) => Promise<ProxyEndpoint<BackendHandle>>;

    /** Instantiate backend through the device join protocol. */
    readonly fromDeviceJoin: (
        init: Remote<BackendInit>,
        deviceLinkingSetup: ProxyEndpoint<DeviceLinkingSetup>,
        shouldRestoreOldMessages: boolean,
        certificatePinRecoveryEndpoint: ProxyEndpoint<CertificatePinRecoveryHandle>,
    ) => Promise<ProxyEndpoint<BackendHandle>>;

    /** Instantiate backend from an existing test configuration. */
    readonly fromTestConfiguration: (
        init: Remote<BackendInit>,
        clientInfo: ClientInfo,
        testData?: TestDataJson,
    ) => Promise<void>;

    /**
     * Instantiate backend by self-generating a brand-new standalone identity (OnPrem only). Creates
     * the database + key storage and returns the created/restored identity plus the inline
     * Safe-backup outcome (create flow); the regular boot path then connects.
     */
    readonly fromStandaloneIdentity: (
        init: Remote<BackendInit>,
        clientInfo: ClientInfo,
        setup: StandaloneIdentitySetup,
    ) => Promise<StandaloneIdentityResult>;
}

/**
 * Service factories needed for a backend worker.
 */
export interface FactoriesForBackend {
    /** Instantiate identity presence factory. */
    readonly hasIdentity: () => boolean;
    /** Instantiate logger factory. */
    readonly logging: (rootTag: string, defaultStyle: string) => LoggerFactory;
    /** Instantiate key storage. */
    readonly keyStorage: (
        services: ServicesForKeyStorageFactory,
        log: Logger,
        loadFromOldProfile?: boolean,
    ) => KeyStorage;
    /** Instantiate file storage. */
    readonly fileStorage: (
        services: ServicesForFileStorageFactory,
        log: Logger,
        loadFromOldProfile?: boolean,
    ) => FileStorage;
    /** Instantiate temp file storage. */
    readonly tempFileStorage: (log: Logger) => TempFileSystemFileStorage;
    /** Instantiate compressor. */
    readonly compressor: () => Compressor;
    /**
     * Instantiate database backend.
     *
     * Note: The {@link key} may be consumed and purged after initialization!
     */
    readonly db: (
        services: ServicesForDatabaseFactory,
        log: Logger,
        supplementaryMigrationInformation: DbMigrationSupplements,
        key: RawDatabaseKey,
        shouldExist: boolean,
        loadFromOldProfile?: boolean,
    ) => DatabaseBackend;
}

/**
 * Linking state error sub-types.
 *
 * - connection-error: Failed to connect to the rendezvous server (or the connection aborted).
 * - rendezvous-error: The rendezvous protocol did not succeed.
 * - join-error: The device join protocol did not succeed.
 * - restore-error: Restoring essential data did not succeed.
 * - identity-transfer-prohibited: Restoring failed because user tried to link a Threema Work ID
 *   with the consumer build variant, or vice versa.
 * - invalid-identity: Restoring failed because user identity is unknown or revoked.
 * - invalid-work-credentials: Restoring failed because user's Threema Work credentials are invalid
 *   or expired.
 * - registration-error: Initial registration at Mediator server failed.
 * - generic-error: Some other error during linking.
 * - onprem-configuration-error: An error when parsing or verifying the onprem configuration file.
 * - old-messages-restoration-error: An error when trying to restore the messages from an old
 *   profile.
 */
export type LinkingStateErrorType =
    | {readonly kind: 'connection-error'; readonly cause: RendezvousCloseCause}
    | {readonly kind: 'rendezvous-error'; readonly cause: RendezvousCloseCause}
    | {readonly kind: 'join-error'}
    | {readonly kind: 'restore-error'}
    | {readonly kind: 'identity-transfer-prohibited'}
    | {readonly kind: 'invalid-identity'}
    | {readonly kind: 'invalid-work-credentials'}
    | {readonly kind: 'registration-error'}
    | {readonly kind: 'generic-error'}
    | {readonly kind: 'onprem-configuration-error'}
    | {readonly kind: 'old-messages-restoration-error'};

export type SyncingPhase = 'receiving' | 'loading' | 'encrypting' | 'restoring';

/**
 * Matches the interface in `ui/linking/index.ts`
 */
export interface OppfFetchConfig {
    readonly password: string;
    readonly username: string;
    readonly oppfUrl: string;
}

/** Old-profile policy bootstrap failed safely before Remote Secret authentication. */
class OldProfileRemoteSecretPreparationError extends Error {
    public constructor(error: unknown) {
        super('Unable to prepare old-profile Remote Secret retrieval', {
            cause: ensureError(error),
        });
    }
}

const OLD_PROFILE_RESTORATION_TIMEOUT_MS: u53 = 30_000;

/**
 * The branch the standalone onboarding wizard follows. Matches `StandaloneOnboardingMode` in
 * `ui/linking/index.ts`.
 */
export type StandaloneOnboardingMode = 'create' | 'safe-restore';

/**
 * The top-level onboarding flow chosen on the first wizard step (custom-onprem build only):
 * standalone (self-generated identity) vs link (stock device-join). Matches `OnboardingFlow` in
 * `ui/linking/index.ts`.
 */
export type OnboardingFlow = 'standalone' | 'link';

/**
 * Raw Threema Safe restore credentials collected by the onboarding UI. Matches
 * `SafeRestoreCredentials` in `ui/linking/index.ts` (note `identity` is an unvalidated string here;
 * the bootstrap narrows it to an {@link IdentityString}).
 */
export interface SafeRestoreCredentials {
    readonly identity: string;
    readonly password: string;
    readonly customSafeServerUrl?: string;
}

/**
 * The user's on-demand Threema Safe backup request (T10). Matches `SafeBackupRequest` in
 * `ui/linking/index.ts`. For the standalone "create new ID" flow this is collected during onboarding
 * (before the identity is created) so the backup can be written inline while the raw client key is
 * still in hand — see {@link StandaloneIdentitySetup}.
 */
export interface SafeBackupRequest {
    readonly password: string;
    readonly customSafeServerUrl?: string;
}

/**
 * Outcome of the best-effort inline Threema Safe backup performed during standalone "create new ID"
 * onboarding (T10). `undefined` means no backup was requested. Matches `SafeBackupOutcome` in
 * `ui/linking/index.ts` — surfaced on the success screen so a silent backup failure is not a
 * data-loss trap.
 */
export type SafeBackupOutcome = 'success' | 'failed';

/**
 * Discriminated result of {@link Backend.createSafeBackupNow} (F1Whisper fork, FU-M12). Never
 * thrown across the proxy boundary (the {@link Backend.createSafeBackupNow} lesson from this wave's
 * OPPF-signature check applies equally here).
 *
 * - `wrong-password`: the given key-storage password could not decrypt the key storage (matches
 *   `ChangePassword.svelte`'s precedent of not distinguishing this from other key-storage read
 *   failures, see the call site).
 * - `upload-failed`: the key storage was unlocked, but building/encrypting/uploading the backup
 *   itself failed (network error, Safe server rejection, etc.).
 */
export type SafeBackupNowResult =
    | {readonly ok: true}
    | {readonly ok: false; readonly reason: 'wrong-password' | 'upload-failed'};

/**
 * Result of {@link Backend.createFromStandaloneIdentity}, returned to the onboarding controller so
 * the success screen can show the user their identity (and the inline Safe-backup outcome).
 *
 * - `identity`: the Threema ID that was created (`create` flow) or restored (`restore` flow).
 * - `safeBackupOutcome`: the inline Threema Safe backup outcome for the `create` flow, or `undefined`
 *   when no backup was requested / for the `restore` flow.
 */
export interface StandaloneIdentityResult {
    readonly identity: IdentityString;
    readonly safeBackupOutcome: SafeBackupOutcome | undefined;
}

/**
 * Threema Safe restore credentials supplied by the onboarding UI for the "restore from Safe" branch.
 * The backend derives the backup id/key, downloads and decodes the backup itself (the UI never
 * handles the decoded {@link SafeBackupData}).
 */
export interface StandaloneSafeRestore {
    readonly identity: IdentityString;
    readonly password: string;
    /** Optional custom Safe server URL; defaults to the OPPF `safe.url` when omitted. */
    readonly customSafeServerUrl?: string;
}

/**
 * Common setup parameters shared by both standalone onboarding modes.
 */
interface StandaloneIdentitySetupBase {
    /**
     * OnPrem provisioning config: the OPPF URL plus the activation credentials (username/password)
     * used both as HTTP Basic-Auth to fetch the signed OPPF and, on custom/work builds, persisted as
     * the work credentials for subsequent launches.
     */
    readonly oppfConfig: OppfFetchConfig;
    /** Password used to encrypt the local key storage. */
    readonly keyStoragePassword: string;
    /**
     * Optional profile display name (nickname) chosen during onboarding; pre-seeded into profile
     * settings.
     */
    readonly displayName?: string;
}

/**
 * Setup parameters for the standalone onboarding flow, consumed by
 * {@link Backend.createFromStandaloneIdentity}.
 *
 * - `create`: self-generate a brand-new Threema identity via the OnPrem `CreateIdentityTask`.
 * - `restore`: TRUE identity restore — reconstruct the client key from a Threema Safe backup's
 *   stored private key and reuse the identity the user entered (no new identity is created), then
 *   import contacts/settings from the backup.
 */
export type StandaloneIdentitySetup = StandaloneIdentitySetupBase &
    (
        | {
              readonly mode: 'create';
              /**
               * Optional Threema Safe backup request collected during onboarding. When present, a
               * Safe backup of the freshly created identity is written inline (while the raw client
               * key is still in hand) right after the key storage is created. Restore never sets
               * this (the user just restored from a backup).
               */
              readonly safeBackup?: SafeBackupRequest;
          }
        | {readonly mode: 'restore'; readonly safeRestore: StandaloneSafeRestore}
    );

export type LoadingState =
    | {
          state: // Not ready to initialize yet (e.g., because we don't know whether the key storage is
          // unlocked).
          | 'pending'
              // Loading screen is about to be displayed, but reflection queue processing has not
              // started yet.
              | 'initializing'
              // Reflection queue processing has been cancelled (probably due to a missing internet
              // connection).
              | 'cancelled'
              // Reflection queue processing has successfully finished.
              | 'ready';
      }
    | {
          readonly state: 'processing-reflection-queue';
          readonly reflectionQueueLength: u53;
          readonly reflectionQueueProcessed: u53;
      }
    | {
          // The connection could not be established (e.g. the server is unreachable or the network
          // is down/too slow). A meaningful error is shown with a retry affordance while the
          // connection manager keeps retrying in the background.
          readonly state: 'connection-error';
          readonly reason: 'unable-to-connect';
      };

/**
 * The backend's linking state.
 */
export type LinkingState =
    /**
     * Initial state.
     */
    | {readonly state: 'initializing'}
    /**
     * An OnPrem build is waiting for OPPF URL and credentials to be entered, and for the OPPF contents to be fetched and validated.
     */
    | {readonly state: 'oppf'}
    /**
     * Rendezvous WebSocket connection is established.
     */
    | {readonly state: 'waiting-for-handshake'; joinUri: string}
    /**
     * Rendezvous protocol is complete. The rendezvous path hash is included.
     */
    | {readonly state: 'nominated'; rph: ReadonlyUint8Array}
    /**
     * The "Begin" join message was received, blobs and essential data are being processed.
     */
    | {readonly state: 'syncing'; phase: SyncingPhase}
    /**
     * Essential data is fully processed, we are waiting for the user's password in order to write
     * the key storage.
     */
    | {readonly state: 'waiting-for-password'}
    /**
     * Let the user enter the password of an old profile that was found to restore its messages.
     */
    | {
          readonly state: 'waiting-for-old-profile-password';
          readonly previouslyEnteredPassword?: string;
          readonly type:
              | 'default'
              // Old profile restore was already skipped.
              | 'skipped'
              // Old password is currently being tried and the profile is being restored.
              | 'restoring';
      }
    /**
     * If the user tried to restore messages from another ID, let them restart or continue without
     * messages.
     */
    | {
          readonly state: 'restoration-identity-mismatch';
      }
    /**
     * We are registered at the Mediator server and the device join protocol is complete.
     *
     * For the OnPrem standalone onboarding flow, `identity` carries the Threema ID that was created
     * (or restored), so the wizard's success screen can show it to the user. It is omitted for the
     * regular device-join flow.
     */
    | {readonly state: 'registered'; readonly identity?: IdentityString}
    /**
     * An error occurred, device join did not succeed.
     */
    | {
          readonly state: 'error';
          readonly type: LinkingStateErrorType;
          readonly message: string;
      };

export interface LoadingStateSetup extends ProxyMarked {
    /**
     * State updates sent from the backend to the frontend.
     */
    readonly loadingState: {
        readonly store: WritableStore<LoadingState>;
        readonly updateState: (state: LoadingState) => void;
    } & ProxyMarked;
}

export interface DeviceLinkingSetup extends ProxyMarked {
    /**
     * State updates sent from the backend to the frontend.
     */
    readonly linkingState: {
        readonly store: WritableStore<LinkingState>;
        readonly updateState: (state: LinkingState) => void;
    } & ProxyMarked;

    /**
     * A promise that will be fulfilled by the frontend when the user has chosen a password.
     */
    readonly userPassword: Promise<string>;

    /**
     * A reusable promise that will be resolved when the user entered a password for their old
     * profile.
     */
    readonly oldProfilePassword: ReusablePromise<string | undefined>;

    /**
     * A promise that will be fulfilled by the frontend when the user continues without restoring
     * messages when they linked with a different identity.
     */
    readonly continueWithoutRestoring: Promise<void>;

    /**
     * A promise that will be fulfilled by the frontend when the user has entered a oppf url
     */
    readonly oppfConfig: Promise<OppfFetchConfig>;
}

/**
 * Create an instance of the NotificationService, wrapping a remote endpoint.
 */
function createNotificationService(
    services: Pick<ServicesForBackend, 'device'>,
    endpoint: EndpointService,
    notificationCreator: ProxyEndpoint<NotificationCreator>,
    logging: LoggerFactory,
): NotificationService {
    const notificationCreatorEndpoint = endpoint.wrap<NotificationCreator>(
        notificationCreator,
        logging.logger('com.notification'),
    );
    return new NotificationService(
        services,
        logging.logger('bw.backend.notification'),
        notificationCreatorEndpoint,
    );
}

/**
 * Create an instance of the {@link BackendMediaService} by wrapping an endpoint for the
 * {@link IFrontendMediaService}.
 */
function createMediaService(
    endpoint: EndpointService,
    frontendMediaService: ProxyEndpoint<IFrontendMediaService>,
    logging: LoggerFactory,
): BackendMediaService {
    const frontendMediaServiceEndpoint = endpoint.wrap<IFrontendMediaService>(
        frontendMediaService,
        logging.logger('com.frontend-media-service'),
    );
    return new BackendMediaService(
        logging.logger('bw.backend.media'),
        frontendMediaServiceEndpoint,
    );
}

/**
 * Initialize those backend services that require neither an active identity nor a dynamic config
 * for being initialized.
 */
function initEarlyBackendServicesWithoutConfig(
    factories: FactoriesForBackend,
    {endpoint, logging}: Pick<ServicesForBackend, 'endpoint' | 'logging'>,
    backendInit: BackendInit,
): EarlyBackendServicesThatDontRequireConfig {
    const crypto = new TweetNaClBackend(randomBytes);
    const {mediaEndpoint: frontendMediaServiceEndpoint} = backendInit;
    const compressor = factories.compressor();
    const electron = endpoint.wrap(backendInit.electronEndpoint, logging.logger('com.electron'));
    const media = createMediaService(endpoint, frontendMediaServiceEndpoint, logging);
    const systemDialog = endpoint.wrap(
        backendInit.systemDialogEndpoint,
        logging.logger('com.system-dialog'),
    );
    const taskManager = new TaskManager({logging});
    const keyStorage = factories.keyStorage(
        {crypto, electron, logging, systemInfo: backendInit.systemInfo},
        logging.logger('key-storage'),
    );
    const tempFile = factories.tempFileStorage(logging.logger('temp-file-storage'));
    const volatileProtocolState = new VolatileProtocolStateBackend();
    const webrtc = endpoint.wrap(backendInit.webRtcEndpoint, logging.logger('com.webrtc'));

    return {
        compressor,
        crypto,
        endpoint,
        keyStorage,
        electron,
        logging,
        media,
        systemDialog,
        systemInfo: backendInit.systemInfo,
        taskManager,
        tempFile,
        volatileProtocolState,
        webrtc,
    };
}

/**
 * Initialize the backend services that don't require an active identity, but a dynamic config for
 * being intialized.
 */
function initEarlyBackendServicesWithConfig(
    factories: FactoriesForBackend,
    {
        config,
        crypto,
        electron,
        logging,
        systemInfo,
    }: Pick<ServicesForBackend, 'config' | 'crypto' | 'electron' | 'logging' | 'systemInfo'>,
    workData: IQueryableStore<ThreemaWorkData | undefined> | undefined,
): EarlyBackendServicesThatRequireConfig {
    const file = factories.fileStorage(
        {config, crypto, electron, logging, systemInfo},
        logging.logger('storage'),
    );
    const directory = new FetchDirectoryBackend(
        {config, logging},
        workData === undefined
            ? undefined
            : derive([workData], ([{currentValue: data}]) => data?.workCredentials),
    );
    const sfu = new FetchSfuHttpBackend({config, logging});

    return {
        directory,
        file,
        sfu,
    };
}

/**
 * Init the full backend services.
 *
 * Note: The {@link dgk} will be consumed and purged after initialization!
 */
function initBackendServices(
    backendInit: Pick<BackendInit, 'notificationEndpoint'>,
    earlyServices: EarlyBackendServices,
    db: DatabaseBackend,
    identityData: IdentityData,
    deviceIds: DeviceIds,
    deviceCookie: DeviceCookie,
    dgk: RawDeviceGroupKey,
    nonces: NonceService,
    workData: IQueryableStore<ThreemaWorkData> | undefined,
): ServicesForBackend {
    const {
        config,
        crypto,
        directory,
        endpoint,
        file,
        logging,
        media,
        sfu,
        systemDialog,
        systemInfo,
        taskManager,
        volatileProtocolState,
        webrtc,
        work,
    } = earlyServices;

    const device = new DeviceBackend(
        {crypto, db, logging, nonces},
        identityData,
        deviceIds,
        deviceCookie,
        dgk,
        workData,
    );

    const notification = createNotificationService(
        {device},
        endpoint,
        backendInit.notificationEndpoint,
        logging,
    );

    const persistentProtocolState = new PersistentProtocolStateBackend({db, logging});
    const blob = new FetchBlobBackend({config, device, directory});
    const loadingInfo = new LoadingInfo(logging.logger('loading-info'));
    // F1Whisper fork (P-H05): raised by the model when a disappearing-messages expiry is (re)stamped,
    // so the enforcement service re-arms its deletion timer immediately (subscribed below). Created
    // before the model so both share the same controller instance.
    const disappearingRefresh = new EventController<void>(logging.logger('disappearing-refresh'));
    const modelServices = {
        blob,
        config,
        crypto,
        db,
        device,
        directory,
        disappearingRefresh,
        endpoint,
        file,
        loadingInfo,
        logging,
        media,
        nonces,
        notification,
        sfu,
        taskManager,
        systemDialog,
        systemInfo,
        persistentProtocolState,
        volatileProtocolState,
        webrtc,
        work,
    };
    const model = new ModelRepositories(modelServices);
    const viewModel = new ViewModelRepository(
        {
            model,
            config,
            crypto,
            endpoint,
            file,
            logging,
            device,
            volatileProtocolState,
            systemDialog,
            directory,
            work,
        },
        new ViewModelCache(),
    );
    // F1Whisper fork: disappearing-messages enforcement engine (needs the model + the two DB
    // expiry queries).
    const disappearingMessages = new DisappearingMessageService({
        logging,
        model,
        db,
        disappearingRefresh,
    });
    // F1Whisper fork (P-H12): durable outgoing-message outbox recovery. Needs the full model-layer
    // services so it can reconstruct outgoing send tasks; invoked once from _scheduleBackgroundJobs.
    const outgoingMessageOutboxRecovery = new OutgoingMessageOutboxRecoveryService({
        ...modelServices,
        model,
    });
    // F1Whisper fork (FU-H06 / E1): leader-startup re-assert of MY 1:1 disappearing timers. Same
    // pattern (needs the full model-layer services); invoked once when elected LEADER (see
    // _scheduleBackgroundJobs's leaderState subscription).
    const disappearingTimerReassert = new DisappearingTimerReassertService({
        ...modelServices,
        model,
    });
    const userProfilePictureDistributionRetry = new UserProfilePictureDistributionRetryService({
        ...modelServices,
        model,
    });
    return {
        ...earlyServices,
        blob,
        device,
        disappearingMessages,
        disappearingTimerReassert,
        loadingInfo,
        model,
        nonces,
        notification,
        outgoingMessageOutboxRecovery,
        persistentProtocolState,
        userProfilePictureDistributionRetry,
        viewModel,
        volatileProtocolState,
    };
}

/**
 * Create key storage with the provided data.
 */
async function createKeyStorage(
    services: Pick<
        ServicesForBackend,
        'config' | 'electron' | 'keyStorage' | 'logging' | 'systemInfo'
    >,
    password: string,
    identityData: IdentityData,
    deviceIds: DeviceIds,
    deviceCookie: DeviceCookie,
    ck: RawClientKey,
    dgk: RawDeviceGroupKey,
    databaseKey: RawDatabaseKey,
    thRemoteSecretParameter: boolean,
    workCredentials?: KeyStorageWorkCredentialsStoreData,
    onPremConfig?: KeyStorageOnPremConfigStoreData,
): Promise<void> {
    const {config, keyStorage} = services;
    let remoteSecretWriteData: KeyStorageRemoteSecretWriteData | undefined;

    if (thRemoteSecretParameter) {
        assert(
            workCredentials !== undefined,
            'Work credentials must be present when turning on remote secrets',
        );
        remoteSecretWriteData = await activateRemoteSecret(
            services,
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            config.WORK_SERVER_LEGACY_URL,
            {workCredentials},
            identityData.identity,
            ck,
        );
    }
    try {
        await keyStorage.create(
            password,
            {
                intermediate: {
                    onPremConfig,
                    workCredentials,
                },
                inner: {
                    identityData: {
                        identity: identityData.identity,
                        ck,
                        serverGroup: identityData.serverGroup,
                    },
                    deviceCookie,
                    dgk,
                    databaseKey,
                    deviceIds: {...deviceIds},
                },
            },
            remoteSecretWriteData,
        );
    } catch (error) {
        throw new BackendCreationError(
            'key-storage-error',
            `Could not write to key storage: ${error}`,
            {from: error},
        );
    }
}

/**
 * Early backend handle exposed before full backend initialization.
 * Used for certificate pin recovery when pins are invalid.
 */
export interface CertificatePinRecoveryHandle extends ProxyMarked {
    /**
     * Recover certificate pins using the user's password.
     * Reads intermediate key storage to get OPPF URL, fetches fallback OPPF,
     * and updates certificate pins.
     *
     * @param password User's password to decrypt intermediate key storage
     * @returns Promise that resolves when pins are updated successfully
     */
    readonly recoverCertificatePins: (password: string) => Promise<{isRemoteSecretActive: boolean}>;
}

/**
 * Backend functionality exposed to the UI thread.
 *
 * IMPORTANT: The UI thread should only have very constrained access to specific high-level parts of
 * the backend directly. Low-level APIs must not be exposed. The UI should not be granted access to
 * internal values that it does not need access to. Whenever a property from the {@link Backend}
 * needs to be requested for the sole purpose of forwarding it into a function call to the
 * {@link Backend}, that API should not be exposed!
 */
export interface BackendHandle extends ProxyMarked {
    readonly capture: () => LocalStore<DisplayPacket | undefined>;
    readonly connectionManager: ConnectionManager;
    readonly debug: DebugBackend;
    readonly deviceIds: DeviceIds;
    readonly directory: Pick<DirectoryBackend, 'identity'>;
    /**
     * Prepare for a graceful teardown (quit or profile switch): flush pending outgoing work
     * (messages + their blob uploads) and await in-flight critical writes.
     *
     * Waits until the outgoing task queue drains or the given timeout elapses, then also awaits the
     * in-flight OPPF background refresh and the keystore write chain (F4/P-M08) so a teardown cannot
     * race a partial keystore write. Resolves with the number of outgoing tasks STILL pending
     * (`0` = fully drained; `0` too if not connected).
     */
    readonly flushPendingOutgoing: (timeoutMs: u53) => Promise<u53>;
    /**
     * Sender-side link-preview fetcher (SSRF-hardened, https-only, EXIF-stripped). Called by the
     * renderer's compose-bar chip to fetch the preview for the first URL in the compose text, and to
     * re-validate a received preview card before rendering. Recipient never contacts the URL.
     */
    readonly linkPreview: LinkPreviewBackend;
    readonly keyStorage: Pick<KeyStorage, 'setOnPremConfig' | 'setPassword' | 'setWorkCredentials'>;
    readonly model: Repositories;
    readonly onSystemSuspend: () => Promise<void>;
    /**
     * F1Whisper fork (FU-M12): create an on-demand Threema Safe backup of the current identity,
     * e.g. from a discoverable Settings entry post-onboarding. Re-authenticates with
     * `keyStoragePassword` to briefly access the raw private key ONLY for the duration of this
     * call (the running `ClientKey` deliberately hides it otherwise); the key never crosses back
     * over this proxy boundary, only the {@link SafeBackupNowResult}.
     */
    readonly createSafeBackupNow: (
        keyStoragePassword: string,
        request: SafeBackupRequest,
    ) => Promise<SafeBackupNowResult>;
    readonly viewModel: IViewModelRepository;
    readonly work: WorkBackend;
}

/**
 * The backend combines all required services and contains the core logic of our application.
 *
 * The backend lives in the worker thread. Its {@link BackendHandle} is exposed to the UI thread
 * through the {@link BackendController}.
 */
export class Backend {
    /**
     * F1Whisper fork (F4): the in-flight OPPF background-refresh promise, set from the static
     * cached-OPPF resolve path ({@link _resolveOnPremOppfFile}). The graceful-shutdown flush awaits
     * it so a quit does not drop a refresh whose keystore write is still in flight. Never rejects.
     * Static because the refresh is kicked off during creation, before the instance exists.
     */
    private static _inFlightOppfRefresh: Promise<void> = Promise.resolve();

    public readonly handle: BackendHandle;

    private readonly _log: Logger;
    private readonly _backgroundJobScheduler: BackgroundJobScheduler;
    private readonly _connectionManager: ConnectionManager;
    private readonly _debug: DebugBackend;
    private readonly _disappearingMessageService: DisappearingMessageService;
    private readonly _remoteSecretMonitorProtocol: RemoteSecretMonitoringBase;
    private _capture?: RawCaptureHandlers;

    private constructor(private readonly _services: ServicesForBackend) {
        this._log = _services.logging.logger('backend');
        this._backgroundJobScheduler = new BackgroundJobScheduler(_services.logging);
        // F1Whisper fork: disappearing-messages enforcement engine. The periodic sweep is registered
        // in `_scheduleBackgroundJobs` (its first run recovers messages that expired while closed).
        this._disappearingMessageService = _services.disappearingMessages;
        this._connectionManager = new ConnectionManager(_services, () => this._capture);
        this._debug = new DebugBackend(_services, this._backgroundJobScheduler);
        this.handle = {
            [TRANSFER_HANDLER]: PROXY_HANDLER,
            capture: this.capture.bind(this),
            connectionManager: this._connectionManager,
            debug: this._debug,
            deviceIds: {
                cspDeviceId: _services.device.csp.deviceId,
                d2mDeviceId: _services.device.d2m.deviceId,
            },
            directory: _services.directory,
            flushPendingOutgoing: async (timeoutMs) => {
                // F1Whisper fork: outgoing messages are prepared (blobs uploaded) in the ordered
                // preparation lane BEFORE their send task is queued, so the lane has to drain first
                // and then the task queue gets whatever is left of the same time budget.
                const lane = getOutgoingPreparationLane(this._services.blob);
                const deadline = Date.now() + timeoutMs;
                const laneRemaining = await lane.drain(timeoutMs);
                const taskRemaining = await this._connectionManager.flushPendingOutgoing(
                    Math.max(0, deadline - Date.now()),
                );
                const remaining = laneRemaining + taskRemaining;
                // F4/P-M08: before the process tears down, await in-flight critical writes so a quit
                // or profile switch cannot race a partial keystore write or drop a background OPPF
                // refresh. Await the OPPF refresh first (so its keystore write is enqueued), then
                // drain the keystore write chain. Neither rejects.
                await Backend._inFlightOppfRefresh;
                await this._services.keyStorage.awaitPendingWrites();
                // F1Whisper fork: the bounded flush is over, so abort the uploads that are still
                // running. The process is going away; this makes the server see the closed request
                // at once instead of after its stall timeout. The durable outbox resumes them.
                stopOutgoingUploads(this._services.blob, 'quit');
                return remaining;
            },
            linkPreview: new LinkPreviewBackendImpl({
                logging: _services.logging,
                media: _services.media,
                model: _services.model,
            }),
            model: _services.model,
            keyStorage: _services.keyStorage,
            onSystemSuspend: this.onSystemSuspend.bind(this),
            createSafeBackupNow: this.createSafeBackupNow.bind(this),
            viewModel: _services.viewModel,
            work: _services.work,
        };
        // Log IDs
        {
            const dgid = bytesToHex(_services.device.d2m.dgpk.public);
            const d2m = u64ToHexLe(_services.device.d2m.deviceId);
            const csp = u64ToHexLe(_services.device.csp.deviceId);
            this._log.info(
                `Backend created.\nDevice IDs:\n  DGID = ${dgid}\n  D2M  = ${d2m}\n  CSP  = ${csp}`,
            );
        }

        // Subscribe to the remote secret store to act when it is triggered.
        if (import.meta.env.BUILD_VARIANT !== 'consumer') {
            this._services.model.user.workSettings
                .get()
                .controller.currentRemoteSecretMdmParameter.subscribe((thRemoteSecretSet) => {
                    handleRemoteSecretMdmParameterChange(this._services, thRemoteSecretSet).catch(
                        (error: unknown) => {
                            if (error instanceof KeyStorageError) {
                                throw error;
                            }
                            throw new BackendCreationError(
                                'remote-secret-error',
                                `Failed to ${thRemoteSecretSet !== undefined ? 'activate' : 'deactivate'} due to error: ${extractErrorMessage(ensureError(error), 'short')}`,
                            );
                        },
                    );
                });
        }

        this._remoteSecretMonitorProtocol =
            import.meta.env.BUILD_VARIANT === 'consumer'
                ? StubRemoteSecretMonitoringProtocolBackend.init(
                      this._services,
                      this._backgroundJobScheduler,
                  )
                : RemoteSecretMonitoringProtocolBackend.init(
                      this._services,
                      this._backgroundJobScheduler,
                  );
    }

    /**
     * Return whether or not an identity (i.e. a key storage file) is present in the expected
     * location inside the given `profileDirectoryPath`.
     */
    public static hasIdentity(
        factories: Pick<FactoriesForBackend, 'hasIdentity'>,
        {logging}: Pick<ServicesForBackend, 'logging'>,
    ): boolean {
        const log = logging.logger('backend.create');

        if (factories.hasIdentity()) {
            log.info('Identity found');
            return true;
        }
        log.info('No identity found');
        return false;
    }

    /**
     * Create an instance of the backend worker for an existing identity. The identity information
     * is loaded from the key storage.
     *
     * @param backendInit {BackendInit} Data required to be supplied to a backend worker for
     *   initialization.
     * @param factories {FactoriesForBackend} The factories needed in the backend.
     * @param services The services needed in the backend.
     * @param keyStoragePassword The password used to unlock the key storage.
     * @returns A remote BackendHandle that can be used by the backend controller to access the
     *   backend worker.
     */
    public static async createFromKeyStorage(
        backendInit: BackendInit,
        factories: FactoriesForBackend,
        {endpoint, logging}: Pick<ServicesForBackend, 'endpoint' | 'logging'>,
        keyStoragePassword: string,
        loadingStateSetup: ProxyEndpoint<LoadingStateSetup>,
        certificatePinRecoveryEndpoint: ProxyEndpoint<CertificatePinRecoveryHandle>,
    ): Promise<ProxyEndpoint<BackendHandle>> {
        const log = logging.logger('backend.create.from-keystorage');
        log.info('Creating backend from existing key storage');

        // Initialize services that are needed early
        const phase1Services = initEarlyBackendServicesWithoutConfig(
            factories,
            {endpoint, logging},
            backendInit,
        );

        // Create and expose certificate pin recovery handle BEFORE reading inner key storage
        // This allows the UI to recover from invalid certificate pins.
        const recoveryHandle: CertificatePinRecoveryHandle = {
            [TRANSFER_HANDLER]: PROXY_HANDLER,
            recoverCertificatePins: recoverCertificatePins(
                phase1Services,
                logging,
                async () => await Backend._inFlightOppfRefresh,
            ),
        };

        // Expose the recovery handle
        endpoint.exposeProxy(
            recoveryHandle,
            certificatePinRecoveryEndpoint,
            logging.logger('com.certificate-pin-recovery'),
        );

        const {loadingState} = endpoint.wrap<LoadingStateSetup>(
            loadingStateSetup,
            logging.logger('com.loading-screen'),
        );

        // In OnPrem builds, the config needs to be initialized based on the OPPF (On-Prem Provisioning File).
        // In other builds, the config is static.
        let config: Config;
        // Whether or not to check if updates are available on the Threema Servers. Will be false if
        // this is an OnPrem build and the .oppf file specifies not to check for updates.
        let checkForUpdates: boolean = true;

        // Try to read the credentials from the key storage.
        //
        // TODO(DESK-383): We might need to move this whole section into a pre-step
        //                 before the backend is actually attempted to be created.
        let keyStorageContents: LatestKeyStorageLayers['inner']['consumable'];
        // Set by `resolveOppfAndPinBeforeInnerDecrypt` when Remote Secret requires a freshly
        // verified OPPF before inner decryption. Persistence is intentionally deferred until
        // `keyStorage.init` has completed and the storage is writable through its public API.
        let remoteSecretOppfBootstrap:
            | {
                  readonly source: 'live-regular' | 'fallback-handoff';
                  readonly oppfFile: {readonly parsed: oppf.OppfFile; readonly string: string};
                  readonly keyStorageOverrides: KeyStorageInitOverrides;
              }
            | undefined;
        try {
            // In OnPrem builds with Remote Secret active, decrypting the inner key storage during
            // `init` fetches the Remote Secret over the default Electron session. That session is
            // blocked at startup until `updatePublicKeyPins` is called. We therefore use this
            // callback (invoked after the intermediate is decoded but before the inner is decrypted
            // during the migration) as the earliest point at which the OPPF URL and work credentials
            // are available. The dedicated Remote Secret path normally fetches and verifies a live
            // OPPF. The only cache exception is a fresh, authenticated one-shot fallback handoff
            // staged immediately before a terminally locked restart. In either mode, the selected
            // policy supplies both pins and the Work endpoint before the inner decrypt proceeds.
            // Fetching the OPPF itself needs no dynamic pins: it uses an isolated, statically-pinned
            // Electron session
            // (`getIsolatedSession('oppf-fetch', ...)` in the main process) that is independent of
            // the default session's startup request-block, so there is no deadlock. Previously this
            // callback reused `_resolveOnPremOppfFile`, whose fresh-cache fast path
            // and stale-cache offline fallback could both authorize Remote Secret traffic without a
            // successful live OPPF fetch. It could also attempt `setOnPremConfig` before `init`
            // marked key storage initialized.
            //
            // eslint-disable-next-line func-style
            const resolveOppfAndPinBeforeInnerDecrypt = async ({
                intermediate,
                isInnerRemoteSecretProtected,
            }: {
                readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
                readonly isInnerRemoteSecretProtected: boolean;
            }): Promise<KeyStorageInitOverrides | undefined> => {
                remoteSecretOppfBootstrap =
                    await Backend._resolveOppfAndInstallCurrentPinsForRemoteSecret(
                        phase1Services,
                        intermediate,
                        isInnerRemoteSecretProtected,
                        undefined,
                        true,
                    );
                return remoteSecretOppfBootstrap?.keyStorageOverrides;
            };

            const {
                intermediate: {onPremConfig: storedOnPremConfig, workCredentials},
                // `init` already decrypts and returns the inner key storage contents. Capturing them
                // here lets us skip the redundant `readContents()` call below, which would otherwise
                // re-run the Argon2id password KDF (~1.8s) over the same intermediate layer.
                inner: initialInnerKeyStorageContents,
            } = await phase1Services.keyStorage.init(
                keyStoragePassword,
                resolveOppfAndPinBeforeInnerDecrypt,
            );

            if (import.meta.env.BUILD_ENVIRONMENT === 'onprem') {
                if (storedOnPremConfig?.oppfUrl === undefined) {
                    throw new BackendCreationError(
                        'missing-oppf-url',
                        'Failed to obtain a oppf url in a onprem build',
                    );
                }
                let onPremOppfFile: oppf.OppfFile;
                if (remoteSecretOppfBootstrap !== undefined) {
                    // The selected OPPF and pins were activated before Remote Secret retrieval. Only
                    // now that `keyStorage.init` completed may it be persisted and any one-shot
                    // fallback handoff be consumed.
                    try {
                        await phase1Services.keyStorage.setOnPremConfig(keyStoragePassword, {
                            oppfUrl: storedOnPremConfig.oppfUrl,
                            lastUpdated: dateToUnixTimestampMs(new Date()),
                            oppfCachedConfig: remoteSecretOppfBootstrap.oppfFile.string,
                            oppfCachedConfigIsFallback: false,
                        });
                    } catch (error) {
                        throw new BackendCreationError(
                            'update-onprem-config-error',
                            'Failed to persist the live OnPrem config after Remote Secret retrieval.',
                            {from: error},
                        );
                    }
                    onPremOppfFile = remoteSecretOppfBootstrap.oppfFile.parsed;
                } else {
                    // Non-Remote-Secret-protected identity: unchanged cached-OPPF fast-boot path
                    // (P-H07 / #19) -- a fresh cache is used synchronously here with no network
                    // access, refreshed in the background.
                    const plaintextOnPremConfig = storedOnPremConfig;
                    const resolvedOnPremOppf = await Backend._resolveOnPremOppfFile(
                        phase1Services,
                        keyStoragePassword,
                        workCredentials,
                        plaintextOnPremConfig,
                        log,
                    );
                    onPremOppfFile = resolvedOnPremOppf.parsed;

                    try {
                        assert(
                            await phase1Services.electron.updatePublicKeyPins(
                                onPremOppfFile.domains?.rules,
                            ),
                            'Electron rejected the cached OPPF certificate pins',
                        );
                    } catch (error) {
                        throw new BackendCreationError(
                            'update-public-key-pins-error',
                            'Failed to update public key pins.',
                            {from: error},
                        );
                    }

                    if (resolvedOnPremOppf.deferredOnPremConfig !== undefined) {
                        await Backend._persistOnPremConfigAfterPinActivation(
                            phase1Services,
                            keyStoragePassword,
                            resolvedOnPremOppf.deferredOnPremConfig,
                        );
                    } else if (resolvedOnPremOppf.selectedStagedFallback) {
                        assert(workCredentials !== undefined);
                        await Backend._consumePlaintextFallbackHandoff(
                            phase1Services,
                            keyStoragePassword,
                            workCredentials,
                            plaintextOnPremConfig,
                            log,
                        );
                    }
                }
                config = createConfigFromOppf(onPremOppfFile);
                checkForUpdates =
                    onPremOppfFile.updates?.desktop?.autoUpdate === true &&
                    // Turn off the auto updater in custom builds.
                    import.meta.env.BUILD_VARIANT !== 'custom';
            } else {
                config = createDefaultConfig();
            }

            // Reuse the inner contents already decrypted by `init` above instead of calling
            // `readContents()` again (which repeats the expensive intermediate-layer KDF).
            keyStorageContents = initialInnerKeyStorageContents;
        } catch (error) {
            // In case of a BackendCreationError we want to handle the error in ~/common/dom/backend/controller.ts
            if (error instanceof BackendCreationError) {
                throw error;
            }
            assertError(error, KeyStorageError);
            switch (error.type) {
                case 'not-found':
                    // No key storage was found. Signal this to the caller, so that the device
                    // linking flow can be triggered.
                    throw new BackendCreationError('no-identity', 'No identity was found');
                case 'not-readable':
                    // TODO(DESK-383): Assume a permission issue. This cannot be solved by
                    //     overwriting. Gracefully return to the UI and notify the user.
                    throw new BackendCreationError(
                        'key-storage-error',
                        'Key storage is not readable',
                        {from: error},
                    );
                case 'malformed':
                case 'invalid':
                    // TODO(DESK-383): Assume data corruption. Gracefully return to the UI,
                    //     allow the user to purge all data and start with the device join
                    //     process.
                    throw new BackendCreationError(
                        'key-storage-error',
                        'Key storage contents are malformed or invalid',
                        {from: error},
                    );
                case 'undecryptable':
                    // Assume that the password was incorrect and let the user retry.
                    throw new BackendCreationError(
                        'key-storage-error-wrong-password',
                        'Key storage cannot be decrypted, wrong password?',
                        {from: error},
                    );
                case 'migration-error':
                    // Something went wrong when migrating the key storage.
                    throw new BackendCreationError(
                        'key-storage-migration-error',
                        'Key storage could not be migrated',
                        {from: error},
                    );
                case 'not-initialized':
                case 'internal-error':
                    throw new BackendCreationError(
                        'key-storage-error',
                        'Key storage cannot be read, internal error',
                        {from: error},
                    );
                case 'not-writable':
                    return assertUnreachable(
                        'Unexpected not-writable error when reading key storage',
                    );
                default:
                    unreachable(error.type);
            }
        }

        // Now that the key storage was read and decrypted successfully (i.e. the password is
        // correct), we're able to initialize the loading screen.
        await loadingState.updateState({
            state: 'initializing',
        });

        const workData: IQueryableStore<ThreemaWorkData | undefined> | undefined =
            import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'
                ? derive(
                      [phase1Services.keyStorage.workCredentialsStore],
                      ([{currentValue: currentWorkCredentials}]) =>
                          currentWorkCredentials === undefined
                              ? undefined
                              : ({
                                    workCredentials: currentWorkCredentials,
                                } as const),
                  )
                : undefined;

        // Check for unrecoverable problems
        if (
            (import.meta.env.BUILD_VARIANT === 'work' ||
                import.meta.env.BUILD_VARIANT === 'custom') &&
            workData?.get() === undefined
        ) {
            // The work app requires work credentials. Older versions of the app did not yet sync
            // and store these fields. Thus, enforce this requirement here.
            throw new BackendCreationError(
                'missing-work-credentials',
                'This is a work app, but no work data was found. Profile should be relinked.',
            );
        }

        // Initialise the remaining services
        const phase2Services = {
            ...initEarlyBackendServicesWithConfig(factories, {...phase1Services, config}, workData),
            config,
            work:
                import.meta.env.BUILD_VARIANT === 'work' ||
                import.meta.env.BUILD_VARIANT === 'custom'
                    ? new FetchWorkBackend({config, logging, systemInfo: backendInit.systemInfo})
                    : new StubWorkBackend(),
        };

        // Open database
        const db = factories.db(
            {config},
            logging.logger('db'),
            {userIdentity: keyStorageContents.identityData.identity},
            keyStorageContents.databaseKey,
            true,
        );

        // Create nonces service
        const nonces = new NonceService(
            {crypto: phase1Services.crypto, db, logging},
            new Identity(keyStorageContents.identityData.identity),
        );

        // Extract identity data from key storage
        const identityData = {
            identity: keyStorageContents.identityData.identity,
            ck: SecureSharedBoxFactory.consume(
                phase1Services.crypto,
                nonces,
                NonceScope.CSP,
                keyStorageContents.identityData.ck,
            ) as ClientKey,
            serverGroup: keyStorageContents.identityData.serverGroup,
        };
        const deviceIds = keyStorageContents.deviceIds;
        const dgk = keyStorageContents.dgk;

        // Create backend
        const backendServices = initBackendServices(
            backendInit,
            {...phase1Services, ...phase2Services},
            db,
            identityData,
            deviceIds,
            ensureDeviceCookie(keyStorageContents.deviceCookie),
            dgk,
            nonces,
            import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'
                ? ensureStoreValue(unwrap(workData))
                : undefined,
        );
        const backend = new Backend(backendServices);

        // Attach-early (offline-DB UI preload): on a normal launch from existing key storage, the
        // database and viewmodel are now fully servable, so we release the loading screen to 'ready'
        // immediately instead of blocking on a fully-established network session (Signal-Desktop
        // style). The connection is started below and proceeds in the background; the UI renders a
        // non-connected state (App.svelte shows a NetworkAlert while not CONNECTED) and updates live
        // as the connection comes up and reflection queue drains.
        //
        // This only affects `createFromKeyStorage` (the normal-launch path). First-ever launch goes
        // through `createFromDeviceJoin`, which drives `linkingState` (not `loadingState`) and stays
        // fully blocking, unaffected by this early-ready.
        //
        // Because the loading screen is dismissed here, the previous loading-screen drivers (the
        // reflection-queue progress subscriber, the bootstrap watchdog, and the connection-state
        // subscriber that transitioned to 'connection-error'/'ready') no longer have a screen to
        // drive: the connection now runs entirely in the background and its progress is surfaced by
        // App.svelte's NetworkAlert instead. They are therefore removed on this path.
        await loadingState.updateState({
            state: 'ready',
        });
        log.info(`Backend servable, loadingState set to 'ready' (attach-early)`);

        // Start connection (runs in the background; the UI is already attached).
        backend._connectionManager.start().catch(() => {
            // This fires when the first connection exits with an error. We can totally ignore it.
        });

        // Schedule background jobs
        backend._scheduleBackgroundJobs(checkForUpdates);

        // Expose the backend on a new channel
        const {local, remote} = endpoint.createEndpointPair<BackendHandle>();
        endpoint.exposeProxy(backend.handle, local, logging.logger('com.backend'));
        return endpoint.transfer(remote, [remote]);
    }

    public static async createFromTestConfiguration(
        backendInit: BackendInit,
        factories: FactoriesForBackend,
        {endpoint, logging}: Pick<ServicesForBackend, 'endpoint' | 'logging'>,
        clientInfo: ClientInfo,
        testData?: TestDataJson,
    ): Promise<void> {
        // Initialize services that are needed early
        const phase1Services = initEarlyBackendServicesWithoutConfig(
            factories,
            {endpoint, logging},
            backendInit,
        );

        const {profile, serverGroup, deviceIds, deviceCookie, workData} =
            testData ?? (await generateTestData(clientInfo, logging));

        // Generate new random database key and keep a copy for key storage
        const databaseKey = wrapRawDatabaseKey(
            phase1Services.crypto.randomBytes(new Uint8Array(DATABASE_KEY_LENGTH)),
        );
        const databaseKeyForKeyStorage = wrapRawDatabaseKey(databaseKey.unwrap().slice());
        const log = logging.logger('backend.create-from-test-configuration');
        let oppFileString: string | undefined = undefined;
        let config: Config;
        if (import.meta.env.BUILD_ENVIRONMENT === 'onprem' && testData?.oppFile !== undefined) {
            try {
                log.debug('Verifying and parsing testData OPPF to create a general config.');
                const bytes = UTF8.encode(testData.oppFile);
                const {body} = oppf.extractOppfBodyAndSignature(
                    bytes,
                    oppf.calculateOppfBodyOffset(bytes),
                );
                const decoded = JSON.parse(UTF8.decode(body)) as unknown;
                oppFileString = decoded as string;
                const serializedOppFile = OPPF_FILE_SCHEMA.parse(decoded);
                config = createConfigFromOppf(serializedOppFile);
            } catch (error: unknown) {
                throw new BackendCreationError(
                    'invalid-oppf',
                    'Unable to parse onprem provisioning file during test backend creation',
                    {from: error},
                );
            }
        } else {
            log.debug('Creating a general config with default values.');
            config = createDefaultConfig();
        }

        // Create database
        const db = factories.db(
            {config},
            logging.logger('db'),
            {userIdentity: profile.identity},
            databaseKey,
            false,
        );

        // Create nonces service
        const nonces = new NonceService(
            {crypto: phase1Services.crypto, db, logging},
            new Identity(profile.identity),
        );

        // Wrap the client key and keep a copy for key storage
        const rawClientKey = wrapRawClientKey(hexToBytes(profile.privateKey));
        const rawClientKeyForKeyStorage = wrapRawClientKey(rawClientKey.unwrap().slice());

        // Create new identity data
        const identityData: IdentityData = {
            identity: profile.identity,
            ck: SecureSharedBoxFactory.consume(
                phase1Services.crypto,
                nonces,
                NonceScope.CSP,
                rawClientKey,
            ) as ClientKey,
            serverGroup,
        };

        // Generate new random device group key
        const dgkForKeyStorage: RawDeviceGroupKey = wrapRawDeviceGroupKey(
            phase1Services.crypto.randomBytes(new Uint8Array(32)),
        );

        const workCredentials =
            import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'
                ? unwrap(workData)
                : undefined;

        await createKeyStorage(
            {...phase1Services, config},
            profile.keyStoragePassword,
            identityData,
            deviceIds,
            deviceCookie,
            rawClientKeyForKeyStorage,
            dgkForKeyStorage,
            databaseKeyForKeyStorage,
            false,
            workCredentials,
            import.meta.env.BUILD_ENVIRONMENT === 'onprem' &&
                oppFileString !== undefined &&
                testData?.oppfUrl !== undefined
                ? {
                      oppfCachedConfig: oppFileString,
                      oppfCachedConfigIsFallback: false,
                      oppfUrl: testData.oppfUrl,
                      lastUpdated: dateToUnixTimestampMs(new Date()),
                  }
                : undefined,
        );
    }

    /**
     * Bootstrap a brand-new **standalone** identity (device-group-of-one) against our OnPrem server,
     * mimicking the android setup wizard's "create new ID" flow.
     *
     * This self-generates a fresh Threema identity via the audited libthreema `CreateIdentityTask`
     * (pointed at the OPPF `directory.url`), forms a device-group-of-one with a random Device Group
     * Key, generates **real random** device identifiers (so two installs never collide), and
     * persists everything through the unchanged {@link createKeyStorage}. Like
     * {@link createFromTestConfiguration} this only creates the database + key storage and returns
     * `void`; the regular boot path ({@link createFromKeyStorage}) then reads the key storage and
     * connects to the mediator, where the single PERSISTENT slot is immediately elected leader and
     * the mediator proxies CSP to the chat server (no `connection.ts` change required).
     *
     * In `restore` mode it instead reconstructs the client key from a Threema Safe backup's stored
     * private key and reuses the identity the user entered (TRUE identity restore, like the android
     * Safe-restore wizard) — no new identity is created — then looks up the server group on the
     * directory and forms a fresh device group (Safe backups never carry a Device Group Key).
     *
     * For `create`, re-onboarding is inherently safe: every invocation mints a *new* identity with a
     * *new* device group, so it can never hit `DEVICE_LIMIT_REACHED` against a previously registered
     * group.
     *
     * @param backendInit Data required to be supplied to a backend worker for initialization.
     * @param factories The factories needed in the backend.
     * @param services The (endpoint + logging) services needed early.
     * @param clientInfo Client info passed to libthreema.
     * @param setup The standalone onboarding parameters: OPPF config, key storage password and the
     *   `mode` (`create` for a new identity, or `restore` with Safe credentials).
     * @returns The created/restored {@link IdentityString} plus the outcome of the best-effort inline
     *   Safe backup (create flow only; `undefined` if no backup was requested). Surfaced on the
     *   success screen.
     * @throws {BackendCreationError} if the OPPF cannot be fetched/verified, identity creation or
     *   Safe download fails, the server group cannot be resolved, or the key storage cannot be
     *   written.
     */
    public static async createFromStandaloneIdentity(
        backendInit: BackendInit,
        factories: FactoriesForBackend,
        {endpoint, logging}: Pick<ServicesForBackend, 'endpoint' | 'logging'>,
        clientInfo: ClientInfo,
        setup: StandaloneIdentitySetup,
    ): Promise<StandaloneIdentityResult> {
        const log = logging.logger('backend.create-from-standalone-identity');

        assert(
            import.meta.env.BUILD_ENVIRONMENT === 'onprem',
            'Standalone identity creation is only supported in OnPrem builds',
        );

        // Initialize services that are needed early
        const phase1Services = initEarlyBackendServicesWithoutConfig(
            factories,
            {endpoint, logging},
            backendInit,
        );

        // Fetch and verify the signed OPPF from the configured OnPrem server.
        let oppfFile: {readonly parsed: oppf.OppfFile; readonly string: string};
        try {
            oppfFile = await this._fetchAndVerifyOppfFile(phase1Services, setup.oppfConfig);
        } catch (error: unknown) {
            throw new BackendCreationError(
                'fetch-oppf-error',
                'Unable to fetch and verify the OPPF during standalone identity creation',
                {from: error},
            );
        }

        // Pin the OnPrem server's public keys (TLS) before any further requests are made.
        try {
            const activated = await phase1Services.electron.updatePublicKeyPins(
                oppfFile.parsed.domains?.rules,
            );
            if (!activated) {
                throw new Error('Electron rejected the standalone OPPF certificate pins');
            }
        } catch (error: unknown) {
            throw new BackendCreationError(
                'update-public-key-pins-error',
                'Unable to update public key pins during standalone identity creation',
                {from: error},
            );
        }

        const config = createConfigFromOppf(oppfFile.parsed);

        // Resolve the identity and raw client key depending on the onboarding mode. The server
        // group is known up-front for `create` (returned by the CreateIdentityTask) but is looked up
        // on the directory for `restore` (after the client key box has been built, below).
        let identity: IdentityString;
        let rawClientKey: RawClientKey;
        let createServerGroup: ServerGroup | undefined;
        let safeBackupForSeeding: SafeBackupData | undefined;

        // Generate the 16-byte device cookie up front (it is persisted to key storage below). The
        // create flow derives the directory `deviceId` from it (hex), so the deviceId is stable and
        // recoverable from the keystore instead of a throwaway value -- the same install always
        // presents the same directory device-binding id.
        const deviceCookieBytes = phase1Services.crypto.randomBytes(new Uint8Array(16));
        const deviceCookie = ensureDeviceCookie(deviceCookieBytes);

        switch (setup.mode) {
            case 'create': {
                // Self-generate a brand-new Threema identity against our OnPrem directory server via
                // the audited libthreema `CreateIdentityTask` (full two-phase ECDHE token
                // challenge).
                const configEnvironment: ConfigEnvironment = {
                    type: 'on-prem',
                    value: createOnPremConfigFromOppf(oppfFile.parsed),
                };
                // Drive the create with the work/on-prem flavor so libthreema includes the
                // activation credentials (the wizard's EnterServer step decodes the `username.password`
                // activation key into `setup.oppfConfig`) as `licenseUsername`/`licensePassword` in
                // the create request -- our OnPrem directory `POST /identity/create` phase 2 rejects
                // (`{success: false}` -> 'server-error') without them.
                const flavor: Flavor = {
                    flavor: 'work',
                    value: {
                        credentials: {
                            username: setup.oppfConfig.username,
                            password: setup.oppfConfig.password,
                        },
                        flavor: 'on-prem',
                    },
                };
                // The directory phase 2 also requires a `deviceId`, which libthreema-wasm never
                // sends; derive it from the (persisted) device cookie so it is stable across
                // re-registration, and let the task splice it into the phase-2 body at the HTTP layer.
                const deviceId = bytesToHex(deviceCookieBytes);
                let createdIdentity;
                try {
                    createdIdentity = await runIdentityCreate(
                        clientInfo,
                        logging,
                        configEnvironment,
                        flavor,
                        deviceId,
                    );
                } catch (error: unknown) {
                    // The create now throws on failure (the poll loop no longer spins forever), so a
                    // failure surfaces here as a clean wizard error state instead of a hang. Surface
                    // an already-redeemed activation key distinctly: the directory returns
                    // `{success: false, error: "...already redeemed license key"}`, which libthreema
                    // propagates as a 'server-error' whose message we forward verbatim.
                    const message = error instanceof Error ? error.message : String(error);
                    if (message.toLowerCase().includes('redeemed')) {
                        throw new BackendCreationError(
                            'no-identity',
                            'The activation key has already been redeemed on another device. ' +
                                'Request a new activation key and try again.',
                            {from: error},
                        );
                    }
                    throw new BackendCreationError(
                        'no-identity',
                        'Failed to create a new standalone identity on the OnPrem directory server',
                        {from: error},
                    );
                }
                identity = ensureIdentityString(createdIdentity.userIdentity);
                createServerGroup = ensureServerGroup(
                    bytesToHex(Uint8Array.of(ensureU8(createdIdentity.serverGroup))),
                );
                rawClientKey = wrapRawClientKey(createdIdentity.clientKey);
                log.info(`Created new standalone identity ${identity}`);
                break;
            }
            case 'restore': {
                // TRUE identity restore: reconstruct the client key from the Threema Safe backup's
                // stored private key and reuse the identity the user entered. We do NOT create a new
                // identity. A fresh device group is generated below (Safe backups never carry a DGK).
                const safeCredentials: SafeCredentials = {
                    identity: setup.safeRestore.identity,
                    password: setup.safeRestore.password,
                    ...(setup.safeRestore.customSafeServerUrl === undefined
                        ? {}
                        : {
                              customSafeServer: {
                                  url: ensureBaseUrl(
                                      setup.safeRestore.customSafeServerUrl,
                                      'https:',
                                  ),
                              },
                          }),
                };
                try {
                    safeBackupForSeeding = await downloadSafeBackup(safeCredentials, {
                        ...phase1Services,
                        config,
                    });
                } catch (error: unknown) {
                    throw new BackendCreationError(
                        'no-identity',
                        `Failed to download/decode the Threema Safe backup for ${setup.safeRestore.identity}`,
                        {from: error},
                    );
                }
                identity = setup.safeRestore.identity;
                rawClientKey = wrapRawClientKey(base64ToU8a(safeBackupForSeeding.user.privatekey));
                log.info(`Restoring identity ${identity} from Threema Safe backup`);
                break;
            }
            default:
                unreachable(setup);
        }

        // Generate a new random database key and keep a copy for the key storage.
        const databaseKey = wrapRawDatabaseKey(
            phase1Services.crypto.randomBytes(new Uint8Array(DATABASE_KEY_LENGTH)),
        );
        const databaseKeyForKeyStorage = wrapRawDatabaseKey(databaseKey.unwrap().slice());

        // Create database
        const db = factories.db(
            {config},
            logging.logger('db'),
            {userIdentity: identity},
            databaseKey,
            false,
        );

        // Create nonces service
        const nonces = new NonceService(
            {crypto: phase1Services.crypto, db, logging},
            new Identity(identity),
        );

        // Wrap the client key and keep a copy for the key storage (the box consumes + purges the
        // original).
        const rawClientKeyForKeyStorage = wrapRawClientKey(rawClientKey.unwrap().slice());
        // For the `create` flow, keep a transient copy of the raw private key bytes so an inline
        // Threema Safe backup can be written after the key storage is created (the running
        // `ClientKey` deliberately hides the raw key, so this is the only point it is available).
        const createSafeBackupRequest = setup.mode === 'create' ? setup.safeBackup : undefined;
        const privateKeyForSafeBackup =
            createSafeBackupRequest === undefined
                ? undefined
                : rawClientKeyForKeyStorage.unwrap().slice();
        const ck = SecureSharedBoxFactory.consume(
            phase1Services.crypto,
            nonces,
            NonceScope.CSP,
            rawClientKey,
        ) as ClientKey;

        // Resolve the server group. For `create` it is returned by the CreateIdentityTask; for
        // `restore` our single-shard OnPrem deployment always assigns server group `0` (both
        // `/identity/create` and `/identity/fetch_priv` only ever return "0", and neither the
        // mediator nor the chat server gate on it), so we use that constant directly instead of an
        // extra `fetch_priv` round-trip.
        const serverGroup: ServerGroup =
            createServerGroup ?? ensureServerGroup(bytesToHex(Uint8Array.of(0)));

        // Create identity data
        const identityData: IdentityData = {
            identity,
            ck,
            serverGroup,
        };

        // Generate REAL RANDOM device identifiers and device cookie (never the test fixtures
        // `123n`/`567n`/zero-cookie): two installs must never collide, or the mediator/chat server
        // closes the connection with `DEVICE_ID_REUSED`.
        const deviceIds: DeviceIds = {
            d2mDeviceId: ensureD2mDeviceId(randomU64(phase1Services.crypto)),
            cspDeviceId: ensureCspDeviceId(randomU64(phase1Services.crypto)),
        };
        // Generate a new random Device Group Key, forming a device-group-of-one.
        const dgkForKeyStorage: RawDeviceGroupKey = wrapRawDeviceGroupKey(
            phase1Services.crypto.randomBytes(new Uint8Array(32)),
        );

        // On custom/work (OnPrem) builds, persist the activation credentials as work credentials so
        // the app can re-authenticate against the OPPF on subsequent launches.
        const workCredentials =
            import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'
                ? {
                      username: setup.oppfConfig.username,
                      password: setup.oppfConfig.password,
                  }
                : undefined;

        await createKeyStorage(
            {...phase1Services, config},
            setup.keyStoragePassword,
            identityData,
            deviceIds,
            deviceCookie,
            rawClientKeyForKeyStorage,
            dgkForKeyStorage,
            databaseKeyForKeyStorage,
            false,
            workCredentials,
            {
                oppfCachedConfig: oppfFile.string,
                oppfCachedConfigIsFallback: false,
                oppfUrl: setup.oppfConfig.oppfUrl,
                lastUpdated: dateToUnixTimestampMs(new Date()),
            },
        );

        // Pre-seed the chosen onboarding display name (nickname) into the freshly-created database's
        // profile settings, so the user's name is set from the start. Best-effort: an invalid
        // nickname (`ensureNickname` throws) or a transient db error must never invalidate the
        // already-persisted key storage / identity.
        if (setup.displayName !== undefined && setup.displayName.trim().length > 0) {
            try {
                db.setSettings('profile', {
                    nickname: ensureNickname(setup.displayName.trim()),
                    profilePicture: undefined,
                    profilePictureShareWith: {group: 'everyone'},
                    workAvailabilityStatus: {
                        category: WorkAvailabilityStatusCategory.NONE,
                        description: '',
                    },
                });
            } catch (error: unknown) {
                log.warn(`Failed to set profile nickname during onboarding: ${error}`);
            }
        }

        // For the `create` flow, if the user opted in during onboarding, write a Threema Safe backup
        // of the freshly created identity inline (the raw private key is still available here). This
        // is best-effort: a failure must never invalidate the already-persisted key storage, but the
        // outcome is reported back so the success screen can surface it (a silent failure would be a
        // data-loss trap).
        let safeBackupOutcome: SafeBackupOutcome | undefined;
        if (createSafeBackupRequest !== undefined && privateKeyForSafeBackup !== undefined) {
            try {
                await uploadSafeBackup(
                    {identity, privateKey: privateKeyForSafeBackup},
                    createSafeBackupRequest.password,
                    {...phase1Services, config},
                    createSafeBackupRequest.customSafeServerUrl === undefined
                        ? undefined
                        : {
                              url: ensureBaseUrl(
                                  createSafeBackupRequest.customSafeServerUrl,
                                  'https:',
                              ),
                          },
                );
                safeBackupOutcome = 'success';
                log.info(`Created Threema Safe backup for new identity ${identity}`);
            } catch (error: unknown) {
                safeBackupOutcome = 'failed';
                log.error(
                    `Failed to create Safe backup for new identity ` +
                        `(the identity was created successfully): ${error}`,
                );
            }
        }

        // For a restore, seed the user profile / contacts / settings from the already-decoded Safe
        // backup after the key storage has been created. This is best-effort: a failure here must
        // never invalidate the already-persisted key storage / restored identity.
        if (safeBackupForSeeding !== undefined) {
            // TODO(T12): Seed profile (nickname/avatar/share) + settings + contacts from
            // `safeBackupForSeeding` into the model here (seed-on-next-boot approach), resolving
            // missing contact public keys via `directory.fetch_bulk`. Deferred follow-up.
            log.info(
                `Restored identity ${identity} from Safe backup ` +
                    `(${safeBackupForSeeding.contacts.length} contacts pending model seeding)`,
            );
        }

        return {identity, safeBackupOutcome};
    }

    /**
     * Create an instance of the backend worker for a new identity. This will start the device
     * linking flow.
     *
     * @param backendInit {BackendInit} Data required to be supplied to a backend worker for
     *   initialization.
     * @param factories {FactoriesForBackend} The factories needed in the backend.
     * @param services The services needed in the backend.
     * @param deviceLinkingSetup Information needed for the device linking flow.
     * @param shouldRestoreOldMessages Whether there is an old profile whose messages should be restored.
     * @param certificatePinRecoveryEndpoint Endpoint used for fallback OPPF recovery.
     * @returns A remote BackendHandle that can be used by the backend controller to access the
     *   backend worker.
     */
    public static async createFromDeviceJoin(
        backendInit: BackendInit,
        factories: FactoriesForBackend,
        {endpoint, logging}: Pick<ServicesForBackend, 'endpoint' | 'logging'>,
        deviceLinkingSetup: ProxyEndpoint<DeviceLinkingSetup>,
        shouldRestoreOldMessages: boolean,
        certificatePinRecoveryEndpoint: ProxyEndpoint<CertificatePinRecoveryHandle>,
    ): Promise<ProxyEndpoint<BackendHandle>> {
        const log = logging.logger('backend.create.from-join');
        log.info('Creating backend through device linking flow');

        // Initialize services that are needed early
        const phase1Services = initEarlyBackendServicesWithoutConfig(
            factories,
            {endpoint, logging},
            backendInit,
        );

        // Get access to linking setup information
        const wrappedDeviceLinkingSetup = endpoint.wrap<DeviceLinkingSetup>(
            deviceLinkingSetup,
            logging.logger('com.device-linking'),
        );

        const {linkingState} = wrappedDeviceLinkingSetup;

        // Helper function for error handling

        async function throwLinkingError(
            message: string,
            type: LinkingStateErrorType,
            error?: Error,
        ): Promise<never> {
            await linkingState.updateState({state: 'error', type, message});
            if (error !== undefined) {
                message += `\n\n${extractErrorTraceback(error)}`;
            }
            log.error(message);
            throw new BackendCreationError('handled-linking-error', message, {from: error});
        }

        let config: Config;
        let oppfConfig: OppfFetchConfig | undefined;
        let oppfFile: {readonly parsed: oppf.OppfFile; readonly string: string} | undefined;
        let workCredentials: ThreemaWorkCredentials | undefined;
        let checkForUpdates: boolean = true;

        // Handle OnPrem (if necessary)
        if (import.meta.env.BUILD_ENVIRONMENT === 'onprem') {
            // Request OPPF config from the user
            await linkingState.updateState({state: 'oppf'});
            oppfConfig = await wrappedDeviceLinkingSetup.oppfConfig;

            // Fetch and verify OPPF
            try {
                oppfFile = await this._fetchAndVerifyOppfFile(phase1Services, oppfConfig);
                workCredentials = {
                    username: oppfConfig.username,
                    password: oppfConfig.password,
                };
            } catch (error) {
                let message = 'Unable to fetch and verify OPPF';
                if (error !== undefined) {
                    message += `\n\n${extractErrorTraceback(ensureError(error))}`;
                }
                log.error(message);
                await linkingState.updateState({
                    state: 'error',
                    type: {kind: 'onprem-configuration-error'},
                    message,
                });

                return unreachable(await eternalPromise());
            }

            try {
                const activated = await phase1Services.electron.updatePublicKeyPins(
                    oppfFile.parsed.domains?.rules,
                );
                if (!activated) {
                    throw new Error('Electron rejected the linked-device OPPF certificate pins');
                }
            } catch (error) {
                let message = 'Unable to update public key pins.';
                if (error !== undefined) {
                    message += `\n\n${extractErrorTraceback(ensureError(error))}`;
                }
                log.error(message);
                await linkingState.updateState({
                    state: 'error',
                    type: {kind: 'onprem-configuration-error'},
                    message,
                });

                return unreachable(await eternalPromise());
            }
            config = createConfigFromOppf(oppfFile.parsed);
            checkForUpdates =
                oppfFile.parsed.updates?.desktop?.autoUpdate === true &&
                // Turn off the auto updater in custom builds.
                import.meta.env.BUILD_VARIANT !== 'custom';
        } else {
            config = createDefaultConfig();
        }

        // Set `workData` if `workCredentials` are already present (i.e., if this is an OnPrem build).
        // Note: In regular work builds the value will be set later.
        const workData: IWritableStore<ThreemaWorkData | undefined> | undefined =
            import.meta.env.BUILD_VARIANT !== 'work' && import.meta.env.BUILD_VARIANT !== 'custom'
                ? undefined
                : new WritableStore(workCredentials === undefined ? undefined : {workCredentials});

        // Initialise more services
        const phase2Services = {
            ...initEarlyBackendServicesWithConfig(factories, {...phase1Services, config}, workData),
            config,
        };

        // Generate rendezvous setup with all information needed to show the QR code
        let setup: RendezvousProtocolSetup;
        {
            const rendezvousPath = bytesToHex(
                phase1Services.crypto.randomBytes(new Uint8Array(32)),
            );
            setup = {
                role: 'initiator',
                ak: randomRendezvousAuthenticationKey(phase1Services.crypto),
                relayedWebSocket: {
                    pathId: 1,
                    url: new URL(rendezvousPath, config.rendezvousServerUrl(rendezvousPath)),
                },
            };
        }

        // Create RendezvousConnection and open WebSocket connection
        let rendezvous;
        try {
            rendezvous = await RendezvousConnection.create({logging}, setup);
        } catch (error) {
            // Note: This can happen if something with the RendezvousConnection initial setup fails,
            //       or if the initial WebSocket connection cannot be established.
            return await throwLinkingError(
                `Could not instantiate RendezvousConnection: ${error}`,
                {
                    kind: 'connection-error',
                    cause: error instanceof RendezvousCloseError ? error.cause : 'unknown',
                },
                ensureError(error),
            );
        }
        await linkingState.updateState({
            state: 'waiting-for-handshake',
            joinUri: rendezvous.joinUri,
        });

        // Do the rendezvous handshake and wait for nomination of a path
        let connectResult;
        try {
            connectResult = await rendezvous.connect();
        } catch (error) {
            return await throwLinkingError(
                `Rendezvous handshake failed: ${error}`,
                {
                    kind: 'rendezvous-error',
                    cause: error instanceof RendezvousCloseError ? error.cause : 'unknown',
                },
                ensureError(error),
            );
        }
        log.info('Rendezvous connection established');
        await linkingState.updateState({
            state: 'nominated',
            rph: connectResult.rph,
        });

        // Set up promises and state handling used in the next steps
        const userPasswordPromise = new ResolvablePromise<string>({uncaught: 'default'});
        const syncingPhase = new WritableStore<SyncingPhase>('receiving');
        async function updateSyncingPhase(phase: SyncingPhase): Promise<void> {
            syncingPhase.set(phase);
            if (userPasswordPromise.done) {
                await linkingState.updateState({state: 'syncing', phase});
            }
        }

        // Now that we established the connection and showed the RPH, we can wait for ED to
        // start sending essential data and then run the join protocol.
        // eslint-disable-next-line func-style
        const onBegin = async (): Promise<void> => {
            // Update state and wait for password
            await linkingState.updateState({state: 'waiting-for-password'});

            // Once the password is entered, show "syncing" screen
            wrappedDeviceLinkingSetup.userPassword
                .then(async (password) => {
                    await linkingState.updateState({state: 'syncing', phase: syncingPhase.get()});
                    userPasswordPromise.resolve(password);
                })
                .catch((error: unknown) =>
                    log.error(`Waiting for userPassword promise failed: ${error}`),
                );
        };
        const joinProtocol = new DeviceJoinProtocol(
            connectResult.connection,
            onBegin,
            logging.logger('backend-controller.join'),
            {crypto: phase1Services.crypto, file: phase2Services.file},
        );
        let joinResult: DeviceJoinResult;
        try {
            joinResult = await joinProtocol.join();
        } catch (error) {
            if (error instanceof DeviceJoinError && error.type.kind === 'connection') {
                return await throwLinkingError(
                    `Device join protocol failed: ${error.message}`,
                    {kind: 'connection-error', cause: error.type.cause},
                    error,
                );
            }

            // Abort rendezvous connection
            rendezvous.abort('protocol-error');

            return await throwLinkingError(
                `Device join protocol failed: ${error}`,
                {kind: 'join-error'},
                ensureError(error),
            );
        }

        await updateSyncingPhase('loading');

        // Generate new random database key
        const databaseKey = wrapRawDatabaseKey(
            phase1Services.crypto.randomBytes(new Uint8Array(DATABASE_KEY_LENGTH)),
        );
        const databaseKeyForKeyStorage = wrapRawDatabaseKey(databaseKey.unwrap().slice());

        // Create database
        const db = factories.db(
            {config},
            logging.logger('db'),
            {userIdentity: joinResult.identity},
            databaseKey,
            false,
        );

        // Create nonces service and import nonces from joinResult
        const nonces = new NonceService(
            {crypto: phase1Services.crypto, db, logging},
            new Identity(joinResult.identity),
        );
        log.info(`Importing ${joinResult.cspHashedNonces.size} CSP nonces.`);
        nonces.importNonces(NonceScope.CSP, joinResult.cspHashedNonces);
        log.info(`Importing ${joinResult.d2dHashedNonces.size} D2D nonces.`);
        nonces.importNonces(NonceScope.D2D, joinResult.d2dHashedNonces);

        // Wrap the client key (but keep a copy for the key storage)
        const rawCkForKeyStorage = wrapRawClientKey(joinResult.rawCk.unwrap().slice());
        const ck = SecureSharedBoxFactory.consume(
            phase1Services.crypto,
            nonces,
            NonceScope.CSP,
            joinResult.rawCk,
        ) as ClientKey;

        // Look up identity information and server group on directory server
        let privateData;
        try {
            privateData = await phase2Services.directory.privateData(joinResult.identity, ck);
        } catch (error) {
            const message = `Fetching information about identity failed: ${error}`;
            if (
                error instanceof DirectoryError &&
                (error.type === 'identity-transfer-prohibited' || error.type === 'invalid-identity')
            ) {
                return await throwLinkingError(message, {kind: error.type}, error);
            }
            return await throwLinkingError(message, {kind: 'generic-error'}, ensureError(error));
        }
        if (privateData.serverGroup !== joinResult.serverGroup) {
            // Because the server group entropy was reduced from 8 to 4 bits a few years ago, it's
            // possible that there are still Threema installations where the old server group is
            // being used. Thus, a mismatch can happen in practice, and it should be a warning, not
            // an error. In case of conflict, the server group from the directory server wins.
            log.warn(
                `Server group reported by directory server (${privateData.serverGroup}) does not match server group received from join protocol (${joinResult.serverGroup})`,
            );
        }

        // Validate Threema Work credentials depending on build variant. The consumer app may not
        // receive credentials, the work app must receive (valid) credentials.
        let phase3Services: {
            readonly work: WorkBackend;
        };
        switch (import.meta.env.BUILD_VARIANT) {
            case 'consumer':
                if (joinResult.workCredentials !== undefined) {
                    return await throwLinkingError(
                        `This is a consumer app, but essential data contains Threema Work credentials for ${joinResult.workCredentials.username}.`,
                        {kind: 'generic-error'},
                    );
                }
                phase3Services = {work: new StubWorkBackend()};
                break;
            case 'custom':
            case 'work': {
                let productName = 'Threema Work';
                if (import.meta.env.BUILD_FLAVOR === 'work-onprem') {
                    productName = 'Threema Work (OnPrem)';
                }
                if (import.meta.env.BUILD_FLAVOR === 'custom-onprem') {
                    productName = import.meta.env.APP_NAME;
                }

                if (joinResult.workCredentials === undefined) {
                    return await throwLinkingError(
                        `This is a ${productName} app, but essential data did not include ${productName} credentials. Ensure that you're using the latest mobile app version.`,
                        {kind: 'generic-error'},
                    );
                }
                if (joinResult.workCredentials.username === '') {
                    return await throwLinkingError(
                        `${productName} credentials username is empty.`,
                        {
                            kind: 'invalid-work-credentials',
                        },
                    );
                }
                if (joinResult.workCredentials.password === '') {
                    return await throwLinkingError(
                        `${productName} credentials password is empty.`,
                        {
                            kind: 'invalid-work-credentials',
                        },
                    );
                }

                // In `"work"` builds `workData` must be a store.
                const unwrappedWorkData = unwrap(workData);
                // Set `workCredentials` obtained during device join.
                unwrappedWorkData.set({workCredentials: joinResult.workCredentials});

                phase3Services = {
                    work: new FetchWorkBackend({
                        config,
                        logging,
                        systemInfo: backendInit.systemInfo,
                    }),
                };
                let licenseStatus;
                try {
                    licenseStatus = await phase3Services.work.checkLicense(
                        // Unwrap is fine here because we check above for undefined
                        unwrap(unwrappedWorkData.get()).workCredentials,
                    );
                } catch (error) {
                    return await throwLinkingError(
                        `${productName} credentials could not be validated: ${error}`,
                        {kind: 'generic-error'},
                    );
                }
                if (licenseStatus.valid) {
                    log.info(`${productName} credentials are valid`);
                } else {
                    return await throwLinkingError(
                        `${productName} credentials are invalid or revoked: ${licenseStatus.message}`,
                        {kind: 'invalid-work-credentials'},
                    );
                }

                break;
            }
            default:
                unreachable(import.meta.env.BUILD_VARIANT);
        }

        // Set identity data
        const identityData: IdentityData = {
            identity: joinResult.identity,
            ck,
            serverGroup: privateData.serverGroup,
        };
        const deviceIds: DeviceIds = joinResult.deviceIds;
        const dgk: RawDeviceGroupKey = joinResult.dgk;
        const dgkForKeyStorage = wrapRawDeviceGroupKey(dgk.unwrap().slice());

        // Create backend
        const services = initBackendServices(
            backendInit,
            {...phase1Services, ...phase2Services, ...phase3Services},
            db,
            identityData,
            deviceIds,
            joinResult.cspDeviceCookie,
            dgk,
            nonces,
            import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'
                ? ensureStoreValue(unwrap(workData))
                : undefined,
        );
        const backend = new Backend(services);

        // Initialize database with essential data
        try {
            await joinProtocol.restoreEssentialData(services.model, identityData.identity);
        } catch (error) {
            return await throwLinkingError(
                `Failed to restore essential data: ${error}`,
                {kind: 'restore-error'},
                ensureError(error),
            );
        }

        // Wait for user password (or connection aborting)
        log.debug('Waiting for user password');
        const userPasswordResult = await taggedRace(
            {tag: 'password', promise: userPasswordPromise},
            {tag: 'join-aborted', promise: joinProtocol.abort.promise},
        );
        if (userPasswordResult.tag === 'join-aborted') {
            // The "aborted" signal was raised before the user password was entered. This means that
            // the rendezvous connection was aborted in the meantime.
            return await throwLinkingError(
                `Device join protocol was aborted while waiting for user password`,
                {kind: 'connection-error', cause: userPasswordResult.value},
            );
        }
        const userPassword = userPasswordResult.value;
        if (userPassword.length === 0) {
            return await throwLinkingError(`Received empty user password`, {kind: 'generic-error'});
        }

        /**
         * Helper function to purge sensitive data.
         */
        function purgeSensitiveData(): void {
            rawCkForKeyStorage.purge();
            dgkForKeyStorage.purge();
            databaseKeyForKeyStorage.purge();
            joinResult.rawCk.purge();
        }

        let onPremConfig: KeyStorageOnPremConfigStoreData | undefined;

        if (import.meta.env.BUILD_ENVIRONMENT === 'onprem') {
            onPremConfig = {
                oppfUrl: unwrap(oppfConfig).oppfUrl,
                oppfCachedConfig: unwrap(oppfFile).string,
                oppfCachedConfigIsFallback: false,
                lastUpdated: dateToUnixTimestampMs(new Date()),
            };
        }

        // Message restoration opens the old profile's key storage in this same run. Resolve that
        // profile's own live OPPF from its decoded intermediate data before retrieving its Remote
        // Secret. The newly linked profile's OPPF must not authorize or route the old profile's
        // authentication token.
        const oldProfileCleanup = {preserveAfterLinking: false};

        async function unlockOldDatabaseKey(password: string): Promise<{
            readonly dbKey: RawDatabaseKey;
            readonly oldUserIdentity: IdentityString;
        }> {
            const deadlineMs = ensureU53(Date.now() + OLD_PROFILE_RESTORATION_TIMEOUT_MS);
            const prepareOldProfileRemoteSecret =
                Backend._createOldProfileRemoteSecretPreparationHandler(phase1Services, deadlineMs);
            return await Backend._runOldProfileAccessWithLinkedProfilePinsRestored(
                phase1Services,
                oppfFile,
                async () =>
                    await unlockDatabaseKey(
                        services,
                        password,
                        log,
                        factories,
                        prepareOldProfileRemoteSecret,
                    ),
            );
        }

        async function skipUnavailableOldProfileRestoration(): Promise<void> {
            log.warn(
                'The old profile is unavailable for restoration; continuing without message restoration and preserving it for later recovery',
            );
            oldProfileCleanup.preserveAfterLinking = true;
            await linkingState.updateState({
                state: 'waiting-for-old-profile-password',
                type: 'skipped',
            });
        }

        // Only continue this process if an old profile was found
        if (shouldRestoreOldMessages) {
            let oldDatabaseKey: RawDatabaseKey | undefined | 'no-restoration' = undefined;
            try {
                const {dbKey, oldUserIdentity} = await unlockOldDatabaseKey(userPassword);
                oldProfileCleanup.preserveAfterLinking = false;
                if (oldUserIdentity !== identityData.identity) {
                    log.debug(
                        'Tried to restore the messages of a profile whose identity does not match the new profile.',
                    );
                    await wrappedDeviceLinkingSetup.linkingState.updateState({
                        state: 'restoration-identity-mismatch',
                    });
                    await wrappedDeviceLinkingSetup.continueWithoutRestoring;
                    oldDatabaseKey = 'no-restoration';
                } else {
                    oldDatabaseKey = dbKey;
                }
            } catch (errorInfo) {
                if (errorInfo instanceof OldProfileRestorationUnavailableError) {
                    await skipUnavailableOldProfileRestoration();
                    oldDatabaseKey = 'no-restoration';
                } else if (
                    errorInfo instanceof KeyStorageError &&
                    errorInfo.type === 'undecryptable'
                ) {
                    // AEAD cannot distinguish a wrong password from password-layer ciphertext
                    // corruption. Preserve the archive if the user stops retrying after this.
                    oldProfileCleanup.preserveAfterLinking = true;
                    log.debug(
                        'New password did not match the password of the old profile, continuing with password restoration dialog',
                    );
                } else {
                    return await throwLinkingError(
                        `Dealing with the restoration of an old identity failed: ${errorInfo}`,
                        {
                            kind: 'generic-error',
                        },
                    );
                }
            }

            let previouslyEnteredPassword: string | undefined = undefined;
            while (oldDatabaseKey === undefined) {
                await wrappedDeviceLinkingSetup.linkingState.updateState({
                    state: 'waiting-for-old-profile-password',
                    previouslyEnteredPassword,
                    type: 'default',
                });

                const oldProfilePassword =
                    await wrappedDeviceLinkingSetup.oldProfilePassword.value();
                if (oldProfilePassword === undefined) {
                    await wrappedDeviceLinkingSetup.linkingState.updateState({
                        state: 'waiting-for-old-profile-password',
                        type: 'skipped',
                    });
                    break;
                }

                await wrappedDeviceLinkingSetup.linkingState.updateState({
                    state: 'waiting-for-old-profile-password',
                    previouslyEnteredPassword,
                    type: 'restoring',
                });
                previouslyEnteredPassword = oldProfilePassword;

                let oldProfileInformation;
                try {
                    oldProfileInformation = await unlockOldDatabaseKey(oldProfilePassword);
                    oldProfileCleanup.preserveAfterLinking = false;
                    if (oldProfileInformation.oldUserIdentity !== identityData.identity) {
                        log.debug(
                            'Tried to restore the messages of a profile whose identity does not match the new profile',
                        );

                        await wrappedDeviceLinkingSetup.linkingState.updateState({
                            state: 'restoration-identity-mismatch',
                        });
                        await wrappedDeviceLinkingSetup.continueWithoutRestoring;
                        oldDatabaseKey = 'no-restoration';
                        break;
                    }
                    oldDatabaseKey = oldProfileInformation.dbKey;
                } catch (errorInfo) {
                    if (errorInfo instanceof OldProfileRestorationUnavailableError) {
                        await skipUnavailableOldProfileRestoration();
                        oldDatabaseKey = 'no-restoration';
                        break;
                    } else if (
                        errorInfo instanceof KeyStorageError &&
                        errorInfo.type === 'undecryptable'
                    ) {
                        oldProfileCleanup.preserveAfterLinking = true;
                        log.debug(
                            'New password did not match the password of the old profile, continuing with password restoration dialog',
                        );
                        continue;
                    } else {
                        return await throwLinkingError(
                            `Dealing with the restoration of an old identity failed: ${errorInfo}`,
                            {
                                kind: 'generic-error',
                            },
                        );
                    }
                }
            }

            if (oldDatabaseKey !== undefined && oldDatabaseKey !== 'no-restoration') {
                await updateSyncingPhase('restoring');
                try {
                    await transferOldMessages(
                        services,
                        oldDatabaseKey,
                        db,
                        config,
                        log,
                        factories,
                        1000,
                    );
                } catch (errorInfo) {
                    return await throwLinkingError(
                        `Restoring the old messages failed: ${errorInfo} `,
                        {
                            kind: 'old-messages-restoration-error',
                        },
                    );
                }
            } else {
                log.info('Not restoring messages, continuing normal flow');
            }
        }

        // Now that essential data is processed, we can connect to the Mediator server and register
        // ourselves
        let initialConnectionResult;
        try {
            initialConnectionResult = await backend._connectionManager.start();
        } catch {
            return await throwLinkingError(
                'Device join protocol was aborted while starting connection',
                {kind: 'connection-error', cause: 'closed'},
            );
        }

        if (initialConnectionResult.connected) {
            await updateSyncingPhase('encrypting');
            // Write key storage
            await createKeyStorage(
                services,
                userPassword,
                identityData,
                deviceIds,
                joinResult.cspDeviceCookie,
                rawCkForKeyStorage,
                dgkForKeyStorage,
                databaseKeyForKeyStorage,
                getAndParseMdm(
                    joinResult.mdmParameters?.threemaParameters ?? new Map(),
                    'th_enable_remote_secret',
                    log,
                ) === true,
                joinResult.workCredentials,
                onPremConfig,
            );
            purgeSensitiveData();

            // Mark join protocol as complete and update state
            try {
                await joinProtocol.complete();
                await linkingState.updateState({state: 'registered'});
            } catch {
                return await throwLinkingError(
                    'Device join protocol was aborted while completing the join protocol',
                    {kind: 'connection-error', cause: 'closed'},
                );
            }

            // Recovery reads and rewrites authenticated intermediate key-storage data, so expose it
            // only after both key-storage creation and device registration have succeeded.
            endpoint.exposeProxy(
                {
                    [TRANSFER_HANDLER]: PROXY_HANDLER,
                    recoverCertificatePins: recoverCertificatePins(
                        phase1Services,
                        logging,
                        async () => await Backend._inFlightOppfRefresh,
                    ),
                } satisfies CertificatePinRecoveryHandle,
                certificatePinRecoveryEndpoint,
                logging.logger('com.certificate-pin-recovery'),
            );

            // Delete old versions after restoration or an explicit user decision. An involuntary
            // archived-access failure skips optional restoration automatically, so retain the old
            // profile for later recovery instead of silently destroying unrestored messages.
            if (!oldProfileCleanup.preserveAfterLinking) {
                await phase1Services.electron.removeOldProfiles();
            }
        } else {
            // Purge data and report error
            purgeSensitiveData();
            let errorInfo = `Close code ${initialConnectionResult.info.code}`;
            const closeCodeName = CloseCodeUtils.nameOf(initialConnectionResult.info.code);
            if (closeCodeName !== undefined) {
                errorInfo += ` (${closeCodeName})`;
            }
            return await throwLinkingError(`Initial connection with server failed: ${errorInfo} `, {
                kind: 'registration-error',
            });
        }

        // After everything is initialized, we can safely write the transmitted MDM parameters to
        // the model.
        if (
            joinResult.mdmParameters !== undefined &&
            // This should never be true in combination with `mdmParameters` but we add the
            // condition as a sanity check here.
            import.meta.env.BUILD_VARIANT !== 'consumer'
        ) {
            services.model.user.workSettings.get().controller.update({
                threemaMdmParameters: joinResult.mdmParameters.threemaParameters,
            });
        }

        // Schedule background jobs
        backend._scheduleBackgroundJobs(checkForUpdates);

        // Expose the backend on a new channel
        const {local, remote} = endpoint.createEndpointPair<BackendHandle>();
        endpoint.exposeProxy(backend.handle, local, logging.logger('com.backend'));
        return endpoint.transfer(remote, [remote]);
    }

    /**
     * Create the pre-decryption handler for an old profile opened during message restoration.
     *
     * Only the old key storage's decoded intermediate data is available to this handler. This keeps
     * its credentials, OPPF policy, pins, and Remote Secret endpoint isolated from the newly linked
     * profile whose backend is currently being created.
     */
    private static _createOldProfileRemoteSecretPreparationHandler(
        phase1Services: EarlyBackendServicesThatDontRequireConfig,
        deadlineMs: u53,
    ): KeyStorageIntermediateDecodeHandler {
        return async ({intermediate, isInnerRemoteSecretProtected}) => {
            if (!isInnerRemoteSecretProtected) {
                return undefined;
            }
            try {
                const bootstrap = await Backend._resolveOppfAndInstallCurrentPinsForRemoteSecret(
                    phase1Services,
                    intermediate,
                    isInnerRemoteSecretProtected,
                    deadlineMs,
                );
                return {
                    ...bootstrap?.keyStorageOverrides,
                    remoteSecretRetrieval: {
                        mode: 'bounded-non-restarting',
                        deadlineMs,
                    },
                };
            } catch (error) {
                throw new OldProfileRemoteSecretPreparationError(error);
            }
        };
    }

    /**
     * Run one old-profile key-storage access and restore the linked profile's verified pins before
     * returning or propagating an error. Old-profile Remote Secret preparation temporarily replaces
     * the default session's pins, but all subsequent linking traffic belongs to the new profile.
     */
    private static async _runOldProfileAccessWithLinkedProfilePinsRestored<T>(
        phase1Services: EarlyBackendServicesThatDontRequireConfig,
        linkedProfileOppfFile:
            | {readonly parsed: oppf.OppfFile; readonly string: string}
            | undefined,
        accessOldProfile: () => Promise<T>,
    ): Promise<T> {
        let result:
            | {readonly success: true; readonly value: T}
            | {readonly success: false; readonly error: unknown};
        try {
            result = {success: true, value: await accessOldProfile()};
        } catch (error) {
            result = {success: false, error};
        }

        if (linkedProfileOppfFile !== undefined) {
            try {
                const activated = await phase1Services.electron.updatePublicKeyPins(
                    linkedProfileOppfFile.parsed.domains?.rules,
                );
                if (!activated) {
                    throw new Error('Electron rejected the linked-profile OPPF certificate pins');
                }
            } catch (error) {
                throw new BackendCreationError(
                    'update-public-key-pins-error',
                    'Failed to restore linked-profile public key pins after old-profile access.',
                    {from: error},
                );
            }
        }

        if (!result.success) {
            throw result.error;
        }
        return result.value;
    }

    /**
     * FU-H03: for a Remote-Secret-protected identity in an OnPrem build, select the current policy,
     * install its certificate pins on the default Electron session, and override the cached Remote
     * Secret endpoint with the same policy's Work endpoint BEFORE the inner key storage is decrypted.
     *
     * Ordinary startup never permits cached/offline fallback because a Remote Secret is an online
     * dependency. The narrow exception is a fresh fallback OPPF that was signature-verified, marked
     * in authenticated intermediate storage, and staged for activation by the preceding recovery.
     * Archived-profile access cannot consume that marker. Non-Remote-Secret profiles continue to use
     * the cached fast-start path unchanged.
     *
     * Fetching the OPPF here does not deadlock on the default session's startup request-block:
     * the live OPPF is fetched over an isolated, statically-pinned Electron session
     * (`getIsolatedSession('oppf-fetch', ...)` in the main process, gated only by
     * `import.meta.env.TLS_CERTIFICATE_PINS`), which is independent of the default session and its
     * `updatePublicKeyPins`-gated request block.
     *
     * @returns the selected OPPF and key-storage endpoint override, or `undefined` when this is not an
     *   OnPrem Remote-Secret path.
     * @throws {BackendCreationError} if policy selection, verification, or pin activation fails.
     */
    private static async _resolveOppfAndInstallCurrentPinsForRemoteSecret(
        phase1Services: EarlyBackendServicesThatDontRequireConfig,
        intermediate: LatestKeyStorageLayers['intermediate']['consumable'],
        isInnerRemoteSecretProtected: boolean,
        deadlineMs?: u53,
        allowFallbackHandoff: boolean = false,
    ): Promise<
        | {
              readonly source: 'live-regular' | 'fallback-handoff';
              readonly oppfFile: {readonly parsed: oppf.OppfFile; readonly string: string};
              readonly keyStorageOverrides: KeyStorageInitOverrides;
          }
        | undefined
    > {
        if (import.meta.env.BUILD_ENVIRONMENT !== 'onprem') {
            return undefined;
        }
        if (!isInnerRemoteSecretProtected) {
            // Inner is plaintext: `init`'s inner decryption doesn't need network access, so there
            // is no potential for a deadlock. Pins are installed after `init` returns, on the
            // normal `_resolveOnPremOppfFile` path -- this preserves the cached-OPPF fast-boot path
            // (no pin resolution added here at all).
            return undefined;
        }
        if (intermediate.workCredentials === undefined) {
            throw new BackendCreationError(
                'missing-work-credentials',
                'Cannot fetch a live OPPF for Remote Secret without Work credentials.',
            );
        }
        if (intermediate.onPremConfig?.oppfUrl === undefined) {
            throw new BackendCreationError(
                'missing-oppf-url',
                'Cannot fetch a live OPPF for Remote Secret without an OPPF URL.',
            );
        }

        let source: 'live-regular' | 'fallback-handoff';
        let currentOppfFile: {readonly parsed: oppf.OppfFile; readonly string: string};
        if (allowFallbackHandoff && intermediate.onPremConfig.oppfCachedConfigIsFallback) {
            try {
                const cached = OPPF_FILE_SCHEMA.parse(
                    JSON.parse(intermediate.onPremConfig.oppfCachedConfig),
                );
                const decision = oppf.decideCachedOppfUsage(
                    {
                        expiresMs: cached.license.expires.getTime(),
                        lastUpdatedMs: Number(intermediate.onPremConfig.lastUpdated),
                        refreshSeconds: cached.refresh,
                    },
                    Date.now(),
                );
                if (decision.refresh !== 'skip') {
                    throw new Error('Fallback OPPF handoff is no longer fresh');
                }
                currentOppfFile = {
                    parsed: cached,
                    string: intermediate.onPremConfig.oppfCachedConfig,
                };
                source = 'fallback-handoff';
            } catch (error) {
                throw new BackendCreationError(
                    'invalid-oppf',
                    'The staged fallback OPPF is not usable for Remote Secret retrieval.',
                    {from: error},
                );
            }
        } else {
            try {
                currentOppfFile = await Backend._fetchAndVerifyOppfFile(
                    phase1Services,
                    {
                        oppfUrl: intermediate.onPremConfig.oppfUrl,
                        username: intermediate.workCredentials.username,
                        password: intermediate.workCredentials.password,
                    },
                    deadlineMs,
                );
                if (deadlineMs !== undefined) {
                    Backend._remainingDeadlineMs(deadlineMs);
                }
                source = 'live-regular';
            } catch (error) {
                throw new BackendCreationError(
                    'fetch-oppf-error',
                    'Failed to fetch and verify a live OPPF before Remote Secret retrieval.',
                    {from: error},
                );
            }
        }

        try {
            const activated = await phase1Services.electron.updatePublicKeyPins(
                currentOppfFile.parsed.domains?.rules,
            );
            if (!activated) {
                throw new Error('Electron rejected the live OPPF certificate pins');
            }
        } catch (error) {
            throw new BackendCreationError(
                'update-public-key-pins-error',
                'Failed to apply current public key pins before Remote Secret retrieval.',
                {from: error},
            );
        }

        return {
            source,
            oppfFile: currentOppfFile,
            keyStorageOverrides: {
                remoteSecretEndpoint: ensureBaseUrl(currentOppfFile.parsed.work.url, 'https:'),
            },
        };
    }

    /**
     * Resolves the OPPF file for an OnPrem build.
     *
     * If a usable cached OPPF is present (the normal-launch case), it is parsed and returned
     * **synchronously** with no network access, so nothing on the post-KDF critical path blocks on
     * the OnPrem server. The live OPPF fetch + conditional re-cache is kicked off as a
     * fire-and-forget background task (see {@link _refreshOnPremOppfFileInBackground}); a changed
     * OPPF takes effect on the next launch. When no cached OPPF exists yet (first run / relink) — or
     * the cached OPPF is unparseable — the live fetch is awaited synchronously so a valid config is
     * available immediately and re-cached (a corrupt cache self-heals when the server is reachable).
     *
     * @throws {BackendCreationError} if work credentials or the OPPF URL are missing, or if there is
     *   no usable cached config AND the synchronous live fetch fails.
     */
    private static async _resolveOnPremOppfFile(
        phase1Services: EarlyBackendServicesThatDontRequireConfig,
        keyStoragePassword: string,
        workCredentials: ThreemaWorkCredentials | undefined,
        storedOnPremConfig: KeyStorageOnPremConfigStoreData | undefined,
        log: Logger,
    ): Promise<{
        readonly parsed: oppf.OppfFile;
        readonly selectedStagedFallback: boolean;
        readonly deferredOnPremConfig?: NonNullable<KeyStorageOnPremConfigStoreData>;
    }> {
        if (workCredentials === undefined) {
            throw new BackendCreationError(
                'missing-work-credentials',
                'This is a onprem app, but no work data was found. Requesting the work credentials again.',
            );
        }
        const {password, username} = workCredentials;

        if (storedOnPremConfig?.oppfUrl === undefined) {
            throw new BackendCreationError(
                'missing-oppf-url',
                'This is a onprem app, but no oppf url was found. Requesting the oppf url again.',
            );
        }
        const {oppfUrl} = storedOnPremConfig;

        const cachedConfigString = storedOnPremConfig.oppfCachedConfig;
        if (cachedConfigString.length > 0) {
            // Normal launch: use the cached OPPF synchronously (no network on the critical path).
            let cachedParsed: oppf.OppfFile | undefined;
            try {
                cachedParsed = OPPF_FILE_SCHEMA.parse(JSON.parse(cachedConfigString));
            } catch (error) {
                // A corrupt cache must self-heal rather than brick the launch: fall through to the
                // synchronous live fetch below (which re-caches the good result), exactly like the
                // no-cache path. Only an unparseable cache AND a failing fetch stays fatal.
                log.warn(
                    'Cached OPPF is unparseable; falling back to a synchronous live fetch',
                    error,
                );
            }

            if (cachedParsed !== undefined) {
                // P-H07: temporally validate the cached OPPF before use. A fresh, unexpired cache
                // takes the fast path (no network on the critical path); an expired or stale cache is
                // refreshed SYNCHRONOUSLY so an expired license or a rotated/revoked security policy
                // (pins, endpoints, permissions) cannot remain active for the whole session behind a
                // background-only refresh.
                const decision = oppf.decideCachedOppfUsage(
                    {
                        expiresMs: cachedParsed.license.expires.getTime(),
                        lastUpdatedMs: Number(storedOnPremConfig.lastUpdated),
                        refreshSeconds: cachedParsed.refresh,
                    },
                    Date.now(),
                );

                if (decision.refresh === 'skip') {
                    // Fresh + valid: use the cached OPPF synchronously and refresh from the OnPrem
                    // server in the background; a changed OPPF is re-cached for the next launch.
                    // Errors are swallowed (we already have a usable cached config).
                    // F1Whisper fork (F4): capture the in-flight refresh so the graceful-shutdown
                    // flush can await it (its keystore write must not be dropped by a quit). The
                    // helper never rejects (it logs internally), so the caught promise is safe to
                    // await later.
                    if (!storedOnPremConfig.oppfCachedConfigIsFallback) {
                        Backend._inFlightOppfRefresh = this._refreshOnPremOppfFileInBackground(
                            phase1Services,
                            keyStoragePassword,
                            {password, username, oppfUrl},
                            cachedConfigString,
                            Number(storedOnPremConfig.lastUpdated),
                            log,
                        ).catch(() => {
                            // Unreachable: the helper never rejects (it logs internally). Present
                            // only to satisfy the no-floating-promise lint.
                        });
                    }

                    return {
                        parsed: cachedParsed,
                        selectedStagedFallback: storedOnPremConfig.oppfCachedConfigIsFallback,
                    };
                }

                // Expired or stale: refresh synchronously so any rotation applies this session.
                try {
                    const liveParsed = await this._fetchAndVerifyOppfFile(phase1Services, {
                        password,
                        username,
                        oppfUrl,
                    });
                    const liveOnPremConfig = {
                        oppfUrl,
                        lastUpdated: dateToUnixTimestampMs(new Date()),
                        oppfCachedConfig: liveParsed.string,
                        oppfCachedConfigIsFallback: false,
                    } as const;
                    if (!storedOnPremConfig.oppfCachedConfigIsFallback) {
                        await phase1Services.keyStorage
                            .setOnPremConfig(keyStoragePassword, liveOnPremConfig)
                            // A re-cache failure is non-fatal: the freshly-fetched config is still
                            // used for this session. It just is not persisted (next launch
                            // re-validates).
                            .catch((error: unknown) =>
                                log.warn(
                                    'Failed to re-cache the synchronously-refreshed OnPrem config',
                                    error,
                                ),
                            );
                    }
                    return {
                        parsed: liveParsed.parsed,
                        selectedStagedFallback: false,
                        ...(storedOnPremConfig.oppfCachedConfigIsFallback
                            ? {deferredOnPremConfig: liveOnPremConfig}
                            : {}),
                    };
                } catch (error) {
                    if (
                        !storedOnPremConfig.oppfCachedConfigIsFallback &&
                        decision.offlineFallback === 'use-cache'
                    ) {
                        log.warn(
                            `Cached OnPrem config is ${
                                decision.refresh === 'required' ? 'expired' : 'stale'
                            } and a synchronous refresh failed; continuing with the cached configuration`,
                            error,
                        );
                        return {parsed: cachedParsed, selectedStagedFallback: false};
                    }
                    throw new BackendCreationError(
                        'fetch-oppf-error',
                        storedOnPremConfig.oppfCachedConfigIsFallback
                            ? 'The staged fallback OnPrem configuration is no longer fresh and the server is unreachable.'
                            : 'The cached OnPrem configuration is expired beyond the offline grace period and the server is unreachable.',
                        {from: error},
                    );
                }
            }
        }

        // No usable cached OPPF (first run / relink, or a corrupt cache): fetch synchronously so a
        // valid config is available immediately, and persist it as the new cache.
        let liveOppfFile: {readonly parsed: oppf.OppfFile; readonly string: string};
        try {
            liveOppfFile = await this._fetchAndVerifyOppfFile(phase1Services, {
                password,
                username,
                oppfUrl,
            });
        } catch (error) {
            throw new BackendCreationError(
                'fetch-oppf-error',
                'Unable to fetch and verify the OPPF and no usable cached configuration is available.',
                {from: error},
            );
        }

        const liveOnPremConfig = {
            oppfUrl,
            lastUpdated: dateToUnixTimestampMs(new Date()),
            oppfCachedConfig: liveOppfFile.string,
            oppfCachedConfigIsFallback: false,
        } as const;
        if (!storedOnPremConfig.oppfCachedConfigIsFallback) {
            try {
                await phase1Services.keyStorage.setOnPremConfig(
                    keyStoragePassword,
                    liveOnPremConfig,
                );
            } catch (error) {
                throw new BackendCreationError(
                    'update-onprem-config-error',
                    'Failed to update live onprem config',
                    {from: error},
                );
            }
        }

        return {
            parsed: liveOppfFile.parsed,
            selectedStagedFallback: false,
            ...(storedOnPremConfig.oppfCachedConfigIsFallback
                ? {deferredOnPremConfig: liveOnPremConfig}
                : {}),
        };
    }

    /** Persist a replacement for a marked fallback only after its pins have been accepted. */
    private static async _persistOnPremConfigAfterPinActivation(
        phase1Services: EarlyBackendServicesThatDontRequireConfig,
        keyStoragePassword: string,
        onPremConfig: NonNullable<KeyStorageOnPremConfigStoreData>,
    ): Promise<void> {
        try {
            await phase1Services.keyStorage.setOnPremConfig(keyStoragePassword, onPremConfig);
        } catch (error) {
            throw new BackendCreationError(
                'update-onprem-config-error',
                'Failed to persist the replacement OnPrem config after pin activation.',
                {from: error},
            );
        }
    }

    /** Consume a plaintext-profile fallback only after its pins were accepted for this startup. */
    private static async _consumePlaintextFallbackHandoff(
        phase1Services: EarlyBackendServicesThatDontRequireConfig,
        keyStoragePassword: string,
        workCredentials: ThreemaWorkCredentials,
        storedOnPremConfig: NonNullable<KeyStorageOnPremConfigStoreData>,
        log: Logger,
    ): Promise<void> {
        try {
            await phase1Services.keyStorage.setOnPremConfig(keyStoragePassword, {
                ...storedOnPremConfig,
                oppfCachedConfigIsFallback: false,
            });
        } catch (error) {
            throw new BackendCreationError(
                'update-onprem-config-error',
                'Failed to consume the staged fallback OnPrem config after pin activation.',
                {from: error},
            );
        }

        const {password, username} = workCredentials;
        Backend._inFlightOppfRefresh = this._refreshOnPremOppfFileInBackground(
            phase1Services,
            keyStoragePassword,
            {password, username, oppfUrl: storedOnPremConfig.oppfUrl},
            storedOnPremConfig.oppfCachedConfig,
            Number(storedOnPremConfig.lastUpdated),
            log,
        ).catch(() => {
            // Unreachable: the helper never rejects (it logs internally). Present only to satisfy
            // the no-floating-promise lint.
        });
    }

    /**
     * Background OPPF refresh: fetch + verify the live OPPF, then persist it for the next launch.
     * The running session retains the cached OPPF's endpoints and pins as one policy generation. A
     * successful unchanged fetch advances the staleness anchor (`lastUpdated`) once the anchor is old
     * enough. Never rejects; all failures are logged and swallowed, because
     * {@link _resolveOnPremOppfFile} already returned a usable cached config and the running session
     * must not be disrupted by a transient network or storage issue. Runs off the critical path.
     */
    private static async _refreshOnPremOppfFileInBackground(
        phase1Services: EarlyBackendServicesThatDontRequireConfig,
        keyStoragePassword: string,
        {password, username, oppfUrl}: OppfFetchConfig,
        cachedConfigString: string,
        cachedLastUpdatedMs: u53,
        log: Logger,
    ): Promise<void> {
        let liveOppfFile: {readonly parsed: oppf.OppfFile; readonly string: string};
        try {
            liveOppfFile = await this._fetchAndVerifyOppfFile(phase1Services, {
                password,
                username,
                oppfUrl,
            });
        } catch (error) {
            log.warn(
                'Background OPPF refresh failed; keeping the cached OnPrem configuration',
                error,
            );
            return;
        }

        // Persist the confirmed-fresh state. `setOnPremConfig` re-derives the Argon2id password key
        // (~3.6s), so a byte-stable OPPF is not re-persisted on every launch; but `lastUpdated` IS the
        // staleness anchor read by `decideCachedOppfUsage`, so a successful fetch must still advance it
        // (even for unchanged content) once the anchor has aged, otherwise the cache would drift into
        // the synchronous-refresh branch permanently. This runs off the critical path.
        const contentChanged = liveOppfFile.string !== cachedConfigString;
        if (
            !oppf.shouldRefreshOppfStalenessAnchor({
                contentChanged,
                cachedLastUpdatedMs,
                nowMs: Date.now(),
            })
        ) {
            return;
        }

        try {
            await phase1Services.keyStorage.setOnPremConfig(keyStoragePassword, {
                oppfUrl,
                lastUpdated: dateToUnixTimestampMs(new Date()),
                oppfCachedConfig: liveOppfFile.string,
                oppfCachedConfigIsFallback: false,
            });
            log.info(
                contentChanged
                    ? 'Background OPPF refresh: re-cached the complete OPPF; it will take effect on next launch'
                    : 'Background OPPF refresh: content unchanged; advanced the staleness anchor',
            );
        } catch (error) {
            log.warn('Background OPPF refresh: failed to persist the OnPrem config', error);
        }
    }

    private static async _fetchAndVerifyOppfFile(
        earlyServices: EarlyBackendServicesThatDontRequireConfig,
        {oppfUrl, username, password}: OppfFetchConfig,
        deadlineMs?: u53,
    ): Promise<{readonly parsed: oppf.OppfFile; readonly string: string}> {
        let binary: ArrayBuffer;
        try {
            binary =
                deadlineMs === undefined
                    ? await earlyServices.electron.getOppFile(
                          oppfUrl,
                          username,
                          password,
                          STATIC_CONFIG.USER_AGENT,
                      )
                    : await earlyServices.electron.getOppFile(
                          oppfUrl,
                          username,
                          password,
                          STATIC_CONFIG.USER_AGENT,
                          deadlineMs,
                      );
        } catch (error: unknown) {
            throw new Error(`Failed to fetch the config file: ${error}`);
        }
        let oppfFile: {readonly parsed: oppf.OppfFile; readonly string: string};
        try {
            oppfFile = oppf.verifyOppfFile(
                earlyServices,
                STATIC_CONFIG.ONPREM_CONFIG_TRUSTED_PUBLIC_KEYS,
                new Uint8Array(binary),
            );
        } catch (error: unknown) {
            throw new Error(`Failed to verify the config file: ${error}`);
        }

        return oppfFile;
    }

    private static _remainingDeadlineMs(deadlineMs: u53): u53 {
        const remainingMs = deadlineMs - Date.now();
        if (remainingMs <= 0) {
            throw new Error('Archived-profile restoration deadline exceeded');
        }
        return ensureU53(Math.ceil(remainingMs));
    }

    /**
     * Trigger capturing network packets to be displayed in the debug network tab.
     */
    public capture(): LocalStore<DisplayPacket | undefined> {
        // TODO(DESK-772): We need to create some kind of "push-only" store where data is
        // transferred instead of structuredly cloned.
        this._log.info('Starting to capture packets');
        const store = new WritableStore<DisplayPacket | undefined>(undefined, {
            activator: (): StoreDeactivator => {
                // Forward any captured packets via the remote port
                this._capture = Object.fromEntries(
                    Object.entries(RAW_CAPTURE_CONVERTER).map(([key, {inbound, outbound}]) => [
                        key,
                        {
                            inbound: (packet: RawPacket, meta?: PacketMeta): void =>
                                // TODO(DESK-772): Transfer!
                                {
                                    store.set(inbound(packet, meta)[0]);
                                },
                            outbound: (packet: RawPacket, meta?: PacketMeta): void => {
                                // TODO(DESK-772): Transfer!
                                store.set(outbound(packet, meta)[0]);
                            },
                        },
                    ]),
                ) as RawCaptureHandlers;
                return (): void => (this._capture = undefined);
            },
            debug: {tag: 'capture'},
        });
        return store;
    }

    /**
     * Handle the system suspend signal from electron.
     */
    public async onSystemSuspend(): Promise<void> {
        if (
            import.meta.env.BUILD_VARIANT !== 'work' &&
            import.meta.env.BUILD_VARIANT !== 'custom'
        ) {
            return;
        }

        if (this._services.keyStorage.isRemoteSecretEncrypted) {
            // Remote secret is activated, so we force a restart on suspend.
            this._log.debug('Restarting app on suspend because remote secret is active');
            await this._services.electron
                .remoteSecretSystemSuspensionRestartApp()
                .catch(assertUnreachable);
        }
    }

    /**
     * F1Whisper fork (FU-M12): create an on-demand Threema Safe backup of the current identity.
     * Closes the gap left by the onboarding-only inline backup (T10), which is a one-shot bootstrap
     * step behind a single-resolution promise with no re-callable equivalent -- see the "safe-honest"
     * follow-up on the Wave-1 Amendment.
     *
     * Re-reads and decrypts the key storage with `keyStoragePassword` to briefly access the raw
     * private key (the running `ClientKey` deliberately hides it once the app has booted, so this is
     * the only way to get it back post-onboarding); the raw key never leaves this method, only the
     * discriminated {@link SafeBackupNowResult} crosses back over the proxy boundary.
     */
    public async createSafeBackupNow(
        keyStoragePassword: string,
        request: SafeBackupRequest,
    ): Promise<SafeBackupNowResult> {
        let identity: IdentityString;
        let privateKey: ReadonlyUint8Array;
        try {
            const {
                inner: {identityData},
            } = await this._services.keyStorage.readContents(keyStoragePassword);
            identity = identityData.identity;
            // Defensive copy, matching the onboarding call site's convention around raw key bytes
            // (e.g. `rawClientKeyForKeyStorage.unwrap().slice()`).
            privateKey = identityData.ck.unwrap().slice();
        } catch (error: unknown) {
            // Mirrors `ChangePassword.svelte`'s precedent: any key-storage read failure here is
            // reported as a wrong password rather than distinguishing corruption/IO errors, which
            // the existing change-password flow does not distinguish either.
            this._log.warn(`Failed to unlock key storage for an on-demand Safe backup: ${error}`);
            return {ok: false, reason: 'wrong-password'};
        }

        try {
            await uploadSafeBackup(
                {identity, privateKey},
                request.password,
                this._services,
                request.customSafeServerUrl === undefined
                    ? undefined
                    : {url: ensureBaseUrl(request.customSafeServerUrl, 'https:')},
            );
        } catch (error: unknown) {
            this._log.error(`Failed to create an on-demand Safe backup: ${error}`);
            return {ok: false, reason: 'upload-failed'};
        }

        this._log.info(`Created an on-demand Threema Safe backup for identity ${identity}`);
        return {ok: true};
    }

    /**
     * Schedule backend background jobs.
     */
    private _scheduleBackgroundJobs(checkForUpdates: boolean): void {
        this._log.info('Scheduling background jobs');

        // F1Whisper fork (P-H12): reconstruct send tasks for any outgoing message that was persisted
        // but not confirmed transmitted before the last quit/crash/profile switch. Idempotent (guards
        // against the two backend creation paths both reaching this) and best-effort (a failure here
        // must never block startup). Reconstructed tasks are persistent: while offline they queue and
        // run on the next connect.
        try {
            this._services.outgoingMessageOutboxRecovery.recover();
        } catch (error) {
            this._log.error(`Durable outbox recovery failed: ${error}`);
        }

        // PR3-H05: profile controls use the CSP queue available on each device, so recovery is not
        // leader-only. Re-plan durable intent immediately at startup and periodically below.
        this._services.userProfilePictureDistributionRetry.retryPending();

        // Recover only durable contact/group disappearing-timer intent while this device is leader.
        // Current shared timer values are never scanned or synthesized into outgoing controls.
        this._connectionManager.leaderState.subscribe((state) => {
            const canOriginate = state === D2mLeaderState.LEADER;
            this._services.volatileProtocolState.setCspOriginator(canOriginate);
            this._services.model.call.o2o.handleCspOriginationAuthorityChange(canOriginate);
            if (state !== D2mLeaderState.LEADER) {
                return;
            }
            this._services.disappearingTimerReassert.onLeaderTransition();
        });
        this._backgroundJobScheduler.scheduleRecurringJob(
            () => {
                if (this._connectionManager.leaderState.get() === D2mLeaderState.LEADER) {
                    this._services.disappearingTimerReassert.retryPending();
                }
            },
            {
                tag: 'pending-disappearing-timers',
                intervalS: 60,
                initialTimeoutS: 60,
            },
        );
        this._backgroundJobScheduler.scheduleRecurringJob(
            () => this._services.userProfilePictureDistributionRetry.retryPending(),
            {
                tag: 'pending-user-profile-picture-distributions',
                intervalS: 60,
                initialTimeoutS: 60,
            },
        );

        // Schedule auto updater check every 24h
        if (!import.meta.env.DEBUG && import.meta.env.BUILD_MODE !== 'testing' && checkForUpdates) {
            this._backgroundJobScheduler.scheduleRecurringJob(
                (log) => autoUpdateCheckJob(this._services, log),
                {
                    tag: 'auto-updater',
                    intervalS: 24 * 3600,
                    initialTimeoutS: 1,
                },
            );
        }

        if (
            import.meta.env.BUILD_VARIANT === 'work' ||
            import.meta.env.BUILD_VARIANT === 'custom'
        ) {
            // Schedule license check every 12h
            this._backgroundJobScheduler.scheduleRecurringJob(
                (log) => workLicenseCheckJob(this._services, log),
                {
                    tag: 'work-license-check',
                    intervalS: 12 * 3600,
                    initialTimeoutS: 1,
                },
            );

            // Schedule work sync every 24h (initially)
            this._backgroundJobScheduler.scheduleRecurringJob(
                (log, cancel, update) => workSyncJob(this._services, log, cancel, update),
                {
                    tag: 'work-sync',
                    intervalS: 24 * 3600,
                    initialTimeoutS: 1,
                },
            );
        }

        // Standalone OnPrem (custom) build: declare our own feature mask so peers see our real
        // capabilities. Critically this clears the Forward Security bit -- multi-device clients
        // don't support FS, and advertising it makes peers wrap messages in PFS that the desktop
        // rejects (so messages never arrive). There is no phone-leader in standalone to do this for
        // us. Best-effort + idempotent; re-asserted on every launch so existing installs (created
        // with the FS-capable default) self-correct.
        if (
            import.meta.env.BUILD_ENVIRONMENT === 'onprem' &&
            import.meta.env.BUILD_VARIANT === 'custom'
        ) {
            this._backgroundJobScheduler.scheduleRecurringJob(
                (log) => assertOwnFeatureMaskJob(this._services, log),
                {
                    tag: 'assert-feature-mask',
                    intervalS: 24 * 3600,
                    initialTimeoutS: 2,
                },
            );
        }

        // F1Whisper fork: disappearing-messages sweep. Runs every 60s and once immediately at
        // startup (`initialTimeoutS: 0`), so messages that expired while the app was closed are
        // recovered and deleted. Each sweep also re-arms a precise single-shot timer for the next
        // pending expiry, so messages disappear promptly between periodic sweeps.
        this._backgroundJobScheduler.scheduleRecurringJob(
            (log) => this._disappearingMessageService.sweepExpiredMessages(log),
            {
                tag: 'disappearing-messages',
                intervalS: 60,
                initialTimeoutS: 0,
            },
        );
    }
}

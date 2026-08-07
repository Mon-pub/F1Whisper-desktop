import type {Compressor} from '~/common/compressor';
import type {Config} from '~/common/config';
import type {CryptoBackend} from '~/common/crypto';
import type {INonceService} from '~/common/crypto/nonce';
import type {Device} from '~/common/device';
import type {DisappearingMessageService} from '~/common/dom/backend/disappearing-message-service';
import type {DisappearingTimerReassertService} from '~/common/dom/backend/disappearing-timer-reassert-service';
import type {OutgoingMessageOutboxRecoveryService} from '~/common/dom/backend/outgoing-message-outbox-recovery-service';
import type {UserProfilePictureDistributionRetryService} from '~/common/dom/backend/user-profile-picture-distribution-retry-service';
import type {SystemInfo} from '~/common/electron-ipc';
import type {IFrontendElectronService} from '~/common/electron-service';
import type {FileStorage, TempFileStorage} from '~/common/file-storage';
import type {KeyStorage} from '~/common/key-storage';
import type {LoadingInfo} from '~/common/loading';
import type {LoggerFactory} from '~/common/logging';
import type {BackendMediaService, IFrontendMediaService} from '~/common/media';
import type {Repositories} from '~/common/model';
import type {BlobBackend} from '~/common/network/protocol/blob';
import type {DirectoryBackend} from '~/common/network/protocol/directory';
import type {PersistentProtocolState} from '~/common/network/protocol/persistent-protocol-state';
import type {SfuHttpBackend} from '~/common/network/protocol/sfu';
import type {TaskManager} from '~/common/network/protocol/task/manager';
import type {VolatileProtocolState} from '~/common/network/protocol/volatile-protocol-state';
import type {WorkBackend} from '~/common/network/protocol/work';
import type {NotificationCreator, NotificationService} from '~/common/notification';
import type {SystemDialogService} from '~/common/system-dialog';
import type {EndpointService, Remote} from '~/common/utils/endpoint';
import type {IViewModelRepository} from '~/common/viewmodel';
import type {WebRtcService} from '~/common/webrtc';

/**
 * Services available in the backend.
 */
export interface ServicesForBackend {
    readonly compressor: Compressor;
    readonly config: Config;
    readonly crypto: CryptoBackend;
    readonly device: Device;
    readonly directory: DirectoryBackend;
    readonly blob: BlobBackend;
    readonly electron: Remote<IFrontendElectronService>;
    readonly endpoint: EndpointService;
    readonly file: FileStorage;
    readonly keyStorage: KeyStorage;
    readonly logging: LoggerFactory;
    readonly media: BackendMediaService;
    readonly model: Repositories;
    readonly nonces: INonceService;
    readonly notification: NotificationService;
    readonly persistentProtocolState: PersistentProtocolState;
    readonly sfu: SfuHttpBackend;
    readonly systemDialog: Remote<SystemDialogService>;
    readonly systemInfo: SystemInfo;
    readonly taskManager: TaskManager;
    readonly tempFile: TempFileStorage;
    readonly viewModel: IViewModelRepository;
    readonly volatileProtocolState: VolatileProtocolState;
    readonly work: WorkBackend;
    readonly webrtc: Remote<WebRtcService>;
    readonly loadingInfo: LoadingInfo;
    /** F1Whisper fork: disappearing-messages enforcement engine. */
    readonly disappearingMessages: DisappearingMessageService;
    /** F1Whisper fork (FU-H06 / E1): leader-startup 1:1 disappearing-timer re-assert. */
    readonly disappearingTimerReassert: DisappearingTimerReassertService;
    /** F1Whisper fork (P-H12): durable outgoing-message outbox startup recovery. */
    readonly outgoingMessageOutboxRecovery: OutgoingMessageOutboxRecoveryService;
    /** PR3-H05: durable per-recipient profile-picture startup/periodic recovery. */
    readonly userProfilePictureDistributionRetry: UserProfilePictureDistributionRetryService;
}

/**
 * Backend services that don't require an initialized identity before they can be instantiated.
 */
export type EarlyBackendServices = Omit<
    ServicesForBackend,
    | 'device'
    | 'blob'
    | 'disappearingMessages'
    | 'disappearingTimerReassert'
    | 'loadingInfo'
    | 'model'
    | 'notification'
    | 'nonces'
    | 'outgoingMessageOutboxRecovery'
    | 'persistentProtocolState'
    | 'userProfilePictureDistributionRetry'
    | 'viewModel'
>;

/**
 * Early backend services that require neither an active identity nor a dynamic config for being
 * initialized.
 */
export type EarlyBackendServicesThatRequireConfig = Pick<
    EarlyBackendServices,
    'directory' | 'file' | 'sfu'
>;

/**
 * Early backend services that don't require an active identity, but a dynamic config for being
 * initialized.
 */
export type EarlyBackendServicesThatDontRequireConfig = Omit<
    EarlyBackendServices,
    'config' | 'work' | keyof EarlyBackendServicesThatRequireConfig
>;

/**
 * Services available in the backend controller.
 */
export interface ServicesForBackendController {
    readonly electron: IFrontendElectronService;
    readonly endpoint: EndpointService;
    readonly logging: LoggerFactory;
    readonly media: IFrontendMediaService;
    readonly notification: NotificationCreator;
    readonly systemDialog: SystemDialogService;
    readonly systemInfo: SystemInfo;
    readonly webRtc: WebRtcService;
}

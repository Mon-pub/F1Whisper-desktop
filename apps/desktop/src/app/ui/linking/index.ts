import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {Locale} from '~/app/ui/i18n';
import type {LinkingState, LinkingStateErrorType, SyncingPhase} from '~/common/dom/backend';
import type {IdentityString} from '~/common/network/types';
import type {ReadonlyUint8Array} from '~/common/types';
import type {ReusablePromise} from '~/common/utils/promise';
import type {ResolvablePromise} from '~/common/utils/resolvable-promise';
import type {IWritableStore, ReadableStore, WritableStore} from '~/common/utils/store';

export interface OppfConfig {
    readonly oppfUrl: string;
    readonly username: string;
    readonly password: string;
}

/**
 * The branch the standalone onboarding wizard should follow once the user has chosen how to set up
 * this installation.
 *
 * - `create`: Self-generate a brand-new Threema ID (device-group-of-one) on the configured server.
 * - `safe-restore`: Self-generate the identity, then seed profile/contacts/settings from a Threema
 *   Safe backup.
 */
export type StandaloneOnboardingMode = 'create' | 'safe-restore';

/**
 * The top-level onboarding flow chosen on the very first wizard step (custom-onprem build only).
 *
 * - `standalone`: This installation gets its own self-generated Threema ID (the fork's
 *   {@link StandaloneOnboardingMode} collection follows).
 * - `link`: The stock device-join flow; this installation links with an existing mobile app and
 *   uses that identity.
 */
export type OnboardingFlow = 'standalone' | 'link';

/**
 * Credentials the user provides to restore a Threema Safe backup.
 *
 * The actual download + decrypt happens in the backend (it needs the backend-only
 * {@link ServicesForSafeBackup}); the UI only collects these values. See
 * `~/common/dom/safe/index.ts`.
 */
export interface SafeRestoreCredentials {
    /** The Threema ID whose Safe backup should be restored (e.g. `ECHOECHO`). */
    readonly identity: string;
    /** The Threema Safe password. */
    readonly password: string;
    /**
     * Optional custom Safe server URL. When omitted, the server from the OPPF (`safe.url`) is used.
     */
    readonly customSafeServerUrl?: string;
}

/**
 * The user's request to create a Threema Safe backup on demand (T10). The identity is implicit (the
 * just-created/active profile); only a Safe password (and optional custom server) is collected. The
 * actual backup build + upload happens in the backend (it needs the local model + backend-only
 * services).
 */
export interface SafeBackupRequest {
    /** The Threema Safe password used to encrypt the backup. */
    readonly password: string;
    /**
     * Optional custom Safe server URL. When omitted, the server from the OPPF (`safe.url`) is used.
     */
    readonly customSafeServerUrl?: string;
}

/**
 * The outcome of the best-effort onboarding Safe backup (T10).
 *
 * - `success`: The backup was created + uploaded.
 * - `failed`: The backup attempt failed (non-blocking — onboarding still completed). The user must
 *   be told so they don't believe their key is backed up when it isn't.
 *
 * `undefined` (the store's initial value) means no backup was requested, so no outcome is shown.
 */
export type SafeBackupOutcome = 'success' | 'failed';

export interface LinkingParams {
    /**
     * Linking-related state from the backend.
     */
    readonly linkingState: ReadableStore<LinkingState>;

    /**
     * A promise that should be fulfilled when the user has chosen a password.
     */
    readonly userPassword: ResolvablePromise<string>;

    /**
     * A promise that should be fulfilled when the user has chosen to store the password or not.
     */
    readonly shouldStorePassword: ResolvablePromise<boolean>;

    /**
     * A promise that fulfills when the user enters a password to unlock the key storage of an old
     * profile. Can be resolved multiple times.
     *
     * Is resolved to undefined when the user does not wish to unlock the old key storage, or when no
     * such storage is found.
     */
    readonly oldProfilePassword: ReusablePromise<string | undefined>;

    /**
     * A promise that fulfills if the user tried to restore messages from another Threema ID and
     * decides to continue without message restoration.
     */
    readonly continueWithoutRestoring: ResolvablePromise<void>;

    /**
     * A promise that should be fulfilled when the user clicks the button in the success screen.
     */
    readonly identityReady: ResolvablePromise<void>;

    /**
     * A promise that should be fulfilled when the user has entered OnPrem credentials and URL.
     */
    readonly oppfConfig: ResolvablePromise<OppfConfig>;

    readonly isSafeStorageAvailable: boolean;

    /**
     * A writable store that stores if invalid certificate pins have been detected.
     */
    readonly invalidCertificatePinStore: WritableStore<boolean>;

    /**
     * A promise that should be fulfilled when the user has entered their Threema Safe restore
     * credentials (standalone "Restore from Threema Safe" branch only).
     *
     * Optional: only provided by the backend bootstrap when the standalone safe-restore flow is
     * wired (T3). When absent, the linking wizard falls back to a local promise so the UI still
     * renders; the backend will not receive the credentials until this is threaded through.
     */
    readonly safeRestoreCredentials?: ResolvablePromise<SafeRestoreCredentials>;

    /**
     * A promise that is fulfilled with the chosen standalone onboarding mode as soon as the user
     * picks "Create new ID" or "Restore from Threema Safe" on the entry screen.
     *
     * This is the mode signal the backend bootstrap branches on: `create` →
     * `createFromStandaloneIdentity` with a fresh ID; `safe-restore` → the bootstrap additionally
     * awaits {@link safeRestoreCredentials} and performs a true identity restore. Decoupled from
     * {@link safeRestoreCredentials} so the create path never has to resolve the latter.
     *
     * Optional, same rationale as the other standalone promises (the wizard falls back to a local
     * one when the backend bootstrap has not wired it yet).
     */
    readonly standaloneMode?: ResolvablePromise<StandaloneOnboardingMode>;

    /**
     * A promise that is fulfilled with the top-level onboarding flow as soon as the user picks
     * "standalone" or "link with phone" on the initial mode-selector step (custom-onprem build
     * only). The backend bootstrap awaits this before committing to either the standalone
     * bootstrap or the stock device-join.
     *
     * Optional, same rationale as the other standalone promises (the wizard falls back to a local
     * one when the backend bootstrap has not wired it yet).
     */
    readonly onboardingFlow?: ResolvablePromise<OnboardingFlow>;

    /**
     * The persisted UI locale store (backed by local storage). The initial mode-selector step
     * offers a language picker driving this store, so the user can switch the wizard language
     * before making any other choice. Optional: when absent, the picker is hidden.
     */
    readonly localeStore?: IWritableStore<Locale>;

    /**
     * A promise that should be fulfilled when the user requests a Threema Safe backup during
     * onboarding (T10, create-new-ID flow only). The controller consumes this and creates the
     * backup using the raw client key it holds right after identity creation (the running
     * ClientKey hides the key, so onboarding-time is when it is cleanly available).
     *
     * Resolved with the request to create a backup, or with `undefined` when the user skips it.
     *
     * Optional, same rationale as the other standalone promises (the wizard falls back to a local
     * one when the controller has not wired it yet).
     */
    readonly safeBackupRequest?: ResolvablePromise<SafeBackupRequest | undefined>;

    /**
     * A promise that is resolved with the chosen profile display name (nickname) during onboarding,
     * or with `undefined` when the user skips this step (create-new-ID flow only). The controller
     * awaits this on the create path and pre-seeds it into the freshly-created profile settings.
     *
     * Optional, same rationale as the other standalone promises (the wizard falls back to a local
     * one when the controller has not wired it yet).
     */
    readonly displayName?: ResolvablePromise<string | undefined>;

    /**
     * The outcome of the best-effort onboarding Safe backup (T10), surfaced on the success screen so
     * a failed backup is visible (never silent). The controller sets this after the inline backup
     * attempt and before driving the `registered` linking state. `undefined` = no backup requested.
     *
     * Optional, same rationale as the other standalone promises.
     */
    readonly safeBackupResult?: ReadableStore<SafeBackupOutcome | undefined>;

    /**
     * The 8-character Threema ID that was created (create-new-ID flow) or restored (safe-restore
     * flow), surfaced on the success screen so the user can see and share it. The backend bootstrap
     * sets this store right after the identity is resolved (`runIdentityCreate` for `create`, the
     * user-entered ID for `restore`) and before driving the `registered` linking state.
     *
     * `undefined` (the store's initial value) means the ID is not yet known, so the success screen
     * simply omits the ID line until it is set.
     *
     * Optional, same rationale as the other standalone promises (the wizard renders without the ID
     * when the backend bootstrap has not wired this through yet).
     */
    readonly createdIdentity?: ReadableStore<IdentityString | undefined>;
}

export interface LinkingWizardOppfProps {
    readonly oppfConfig: ResolvablePromise<OppfConfig>;
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}

export interface LinkingWizardScanProps {
    readonly joinUri?: string;
}

export interface LinkingWizardConfirmEmojiProps {
    readonly rph: ReadonlyUint8Array;
}

export interface LinkingWizardOldProfilePasswordProps extends Pick<ModalProps, 'onclose'> {
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
    readonly oldPassword: ReusablePromise<string | undefined>;
    readonly previouslyEnteredPassword?: string;
    readonly state: 'default' | 'skipped' | 'restoring';
}

export interface RestorationIdentityMismatchProps extends Pick<ModalProps, 'onclose'> {
    readonly accept: ResolvablePromise<void>;
}

export interface LinkingWizardSetPasswordProps {
    readonly userPassword: ResolvablePromise<string>;
    readonly shouldStorePassword: ResolvablePromise<boolean>;
    readonly isSafeStorageAvailable: boolean;
}

export interface LinkingWizardSetDisplayNameProps {
    /**
     * Resolved with the trimmed display name (nickname) the user entered, or with `undefined` when
     * the user skips this step (or leaves it empty).
     */
    readonly displayName: ResolvablePromise<string | undefined>;
}

export interface LinkingWizardSyncingProps {
    readonly phase: SyncingPhase;
}

export interface LinkingWizardSuccessProps {
    readonly identityReady: ResolvablePromise<void>;
}

export interface LinkingWizardErrorProps {
    readonly errorType: LinkingStateErrorType;
    readonly errorMessage: string;
    readonly publicKeyPinMismatch: WritableStore<boolean>;
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}

export interface LinkingWizardChooseModeProps {
    /** Invoked when the user chooses the standalone flow (own self-generated Threema ID). */
    readonly onSelectStandalone: () => void;
    /** Invoked when the user chooses to link with the mobile app (stock device-join). */
    readonly onSelectLink: () => void;
    /**
     * The persisted UI locale store driving the language picker shown on this step. When absent,
     * the picker is hidden.
     */
    readonly localeStore?: IWritableStore<Locale>;
}

export interface LinkingWizardCreateNewIdProps {
    /** Invoked when the user chooses to self-generate a brand-new Threema ID. */
    readonly onCreateNewId: () => void;
    /** Invoked when the user chooses to restore an existing identity from a Threema Safe backup. */
    readonly onRestoreFromSafe: () => void;
}

export interface LinkingWizardEnterServerProps {
    /**
     * Fulfilled with the validated OPPF configuration once the user has entered a server host and
     * activation key.
     */
    readonly oppfConfig: ResolvablePromise<OppfConfig>;
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}

export interface LinkingWizardRestoreFromSafeProps {
    /**
     * Fulfilled with the Threema Safe restore credentials once the user has entered them. The actual
     * backup download + decrypt happens in the backend.
     */
    readonly safeRestoreCredentials: ResolvablePromise<SafeRestoreCredentials>;
}

export interface LinkingWizardSuccessCreatedProps {
    /** Whether the identity was created fresh or restored from a Threema Safe backup. */
    readonly mode: StandaloneOnboardingMode;
    /**
     * Fulfilled when the user clicks the button on the success screen to start using the app.
     */
    readonly identityReady: ResolvablePromise<void>;
    /**
     * The outcome of the best-effort onboarding Safe backup (T10). When `success` or `failed`, the
     * success screen shows a corresponding line; when `undefined`, no backup was requested and no
     * line is shown.
     */
    readonly safeBackupResult?: SafeBackupOutcome;
    /**
     * The 8-character Threema ID that was created/restored, displayed prominently so the user can
     * see and share it. When `undefined`, the ID line is omitted (it is not yet known).
     */
    readonly createdIdentity?: IdentityString;
}

/**
 * Props for the onboarding "Back up to Threema Safe" step (T10).
 *
 * Safe backup creation runs INLINE during identity creation (create-new-ID flow) in the worker,
 * where the raw client key is available. This step therefore comes BEFORE creation (after
 * SetPassword): the user opts in with a Safe password (or skips), then the bootstrap runs.
 */
export interface LinkingWizardBackUpToSafeProps {
    /**
     * Fulfilled with the Safe backup request once the user opts in with a Safe password, or with
     * `undefined` when the user skips.
     */
    readonly safeBackupRequest: ResolvablePromise<SafeBackupRequest | undefined>;
    /** Invoked when the user skips the backup and proceeds. */
    readonly onSkip: () => void;
}

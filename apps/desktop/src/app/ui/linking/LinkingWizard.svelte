<script lang="ts">
  import {onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import type {AppServicesForSvelte} from '~/app/types';
  import OnPremConfigurationModal from '~/app/ui/components/partials/modals/onprem-configuration-modal/OnPremConfigurationModal.svelte';
  import type {
    LinkingParams,
    LinkingWizardConfirmEmojiProps,
    LinkingWizardErrorProps,
    LinkingWizardOppfProps,
    LinkingWizardOldProfilePasswordProps,
    LinkingWizardScanProps,
    LinkingWizardSetPasswordProps,
    LinkingWizardSuccessProps,
    LinkingWizardSyncingProps,
    OnboardingFlow,
    RestorationIdentityMismatchProps,
    SafeBackupOutcome,
    SafeBackupRequest,
    SafeRestoreCredentials,
    StandaloneOnboardingMode,
  } from '~/app/ui/linking';
  import BackUpToSafe from '~/app/ui/linking/steps/BackUpToSafe.svelte';
  import ChooseMode from '~/app/ui/linking/steps/ChooseMode.svelte';
  import ConfirmEmoji from '~/app/ui/linking/steps/ConfirmEmoji.svelte';
  import CreateNewId from '~/app/ui/linking/steps/CreateNewId.svelte';
  import EnterServer from '~/app/ui/linking/steps/EnterServer.svelte';
  import Error from '~/app/ui/linking/steps/Error.svelte';
  import OldProfilePassword from '~/app/ui/linking/steps/OldProfilePassword.svelte';
  import RestorationIdentityMismatch from '~/app/ui/linking/steps/RestorationIdentityMismatch.svelte';
  import RestoreFromSafe from '~/app/ui/linking/steps/RestoreFromSafe.svelte';
  import Scan from '~/app/ui/linking/steps/Scan.svelte';
  import SetDisplayName from '~/app/ui/linking/steps/SetDisplayName.svelte';
  import SetPassword from '~/app/ui/linking/steps/SetPassword.svelte';
  import SuccessCreated from '~/app/ui/linking/steps/SuccessCreated.svelte';
  import SuccessLinked from '~/app/ui/linking/steps/SuccessLinked.svelte';
  import Sync from '~/app/ui/linking/steps/Sync.svelte';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';
  import type {LinkingState} from '~/common/dom/backend';
  import type {IdentityString} from '~/common/network/types';
  import {unreachable} from '~/common/utils/assert';
  import {ResolvablePromise} from '~/common/utils/resolvable-promise';

  const log = globals.unwrap().uiLogging.logger(`ui.component.linking-wizard`);

  interface Props {
    /**
     * The information needed to lead the user through the linking process.
     */
    readonly params: LinkingParams;
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
  }

  const {params, services}: Props = $props();

  /**
   * A mapping of linking wizard components to their respective component prop types.
   */
  type LinkingWizardState =
    | {
        component: 'oppf';
        props: LinkingWizardOppfProps;
      }
    | {
        component: 'scan';
        props: LinkingWizardScanProps;
      }
    | {
        component: 'confirmEmoji';
        props: LinkingWizardConfirmEmojiProps;
      }
    | {
        component: 'oldProfilePassword';
        props: LinkingWizardOldProfilePasswordProps;
      }
    | {
        component: 'restorationIdentityMismatch';
        props: RestorationIdentityMismatchProps;
      }
    | {
        component: 'setPassword';
        props: LinkingWizardSetPasswordProps;
      }
    | {
        component: 'sync';
        props: LinkingWizardSyncingProps;
      }
    | {
        component: 'successLinked';
        props: LinkingWizardSuccessProps;
      }
    | {
        component: 'error';
        props: LinkingWizardErrorProps;
      };

  // Standalone onboarding (self-generated Threema ID) is the primary flow in the custom-onprem
  // build. Gated to match the controller bootstrap, which only runs the standalone branch for
  // `custom-onprem`; other onprem variants (e.g. work-onprem) keep the device-join flow below.
  // Consumer builds are unaffected.
  const standaloneFlow =
    import.meta.env.BUILD_ENVIRONMENT === 'onprem' && import.meta.env.BUILD_VARIANT === 'custom';

  /**
   * The collection steps the user walks through locally before the backend takes over and drives
   * the {@link LinkingState} store (syncing/registered/error).
   */
  type StandaloneStep =
    | 'mode-select'
    | 'enter-server'
    | 'restore-from-safe'
    | 'set-password'
    | 'set-display-name'
    | 'back-up-to-safe';

  let standaloneStep = $state<StandaloneStep>('mode-select');
  let standaloneModeValue = $state<StandaloneOnboardingMode>('create');

  // Top-level flow choice (custom-onprem only): standalone (fork flow) vs link (stock
  // device-join). Until the user picks, the wizard shows the ChooseMode selector. Once 'link' is
  // chosen, rendering falls through to the stock `linkingWizardState`-driven branches below.
  let onboardingFlowValue = $state<'unselected' | OnboardingFlow>('unselected');

  // Once the user has set their password, the local collection is complete and the backend bootstrap
  // (T3 `createFromStandaloneIdentity`) drives the rest via `linkingState`.
  let collectionComplete = $state<boolean>(false);

  // The outcome of the best-effort onboarding Safe backup (T10), tracked from the backend store and
  // shown on the success screen so a failed backup is never silent.
  let safeBackupResultValue = $state<SafeBackupOutcome | undefined>(undefined);

  // The created/restored 8-character Threema ID, tracked from the backend store and shown
  // prominently on the success screen. `undefined` until the backend bootstrap resolves it.
  let createdIdentityValue = $state<IdentityString | undefined>(undefined);

  // The safe-restore credentials promise. Prefer the one threaded through by the backend bootstrap;
  // otherwise fall back to a local one so the UI still renders before T3 wiring lands.
  const safeRestoreCredentials: ResolvablePromise<SafeRestoreCredentials> =
    params.safeRestoreCredentials ?? new ResolvablePromise({uncaught: 'default'});

  // Mode signal the backend bootstrap branches on (create vs safe-restore).
  const standaloneMode: ResolvablePromise<StandaloneOnboardingMode> =
    params.standaloneMode ?? new ResolvablePromise({uncaught: 'default'});

  // Flow signal the backend bootstrap awaits before committing to the standalone bootstrap or the
  // stock device-join (custom-onprem only).
  const onboardingFlow: ResolvablePromise<OnboardingFlow> =
    params.onboardingFlow ?? new ResolvablePromise({uncaught: 'default'});

  // Safe backup request (T10, create-new-ID flow). Collected BEFORE creation (the backup is written
  // inline in the worker, where the raw key is available); the controller awaits this on the create
  // path. Resolved with credentials when the user opts in, or `undefined` when they skip.
  const safeBackupRequest: ResolvablePromise<SafeBackupRequest | undefined> =
    params.safeBackupRequest ?? new ResolvablePromise({uncaught: 'default'});

  // Display name (nickname) chosen during onboarding (create-new-ID flow only). Prefer the promise
  // threaded through by the controller; otherwise fall back to a local one so the UI still renders.
  // Resolved with the chosen name when the user proceeds, or `undefined` when they skip.
  const displayName: ResolvablePromise<string | undefined> =
    params.displayName ?? new ResolvablePromise({uncaught: 'default'});

  function handleSelectStandalone(): void {
    onboardingFlowValue = 'standalone';
    onboardingFlow.resolve('standalone');
  }

  function handleSelectLink(): void {
    onboardingFlowValue = 'link';
    onboardingFlow.resolve('link');
  }

  function handleCreateNewId(): void {
    standaloneModeValue = 'create';
    standaloneMode.resolve('create');
    standaloneStep = 'enter-server';
  }

  function handleRestoreFromSafe(): void {
    standaloneModeValue = 'safe-restore';
    standaloneMode.resolve('safe-restore');
    standaloneStep = 'enter-server';
  }

  /**
   * The state of the current step.
   */
  let linkingWizardState = $state<LinkingWizardState>(
    import.meta.env.BUILD_ENVIRONMENT === 'onprem'
      ? {component: 'oppf', props: {oppfConfig: params.oppfConfig, services}}
      : {component: 'scan', props: {joinUri: undefined}},
  );

  // Drive the local standalone collection steps off the same promises the backend consumes, so the
  // UI advances as the user fills them in and the backend (T3) receives the data unchanged.
  onMount(() => {
    if (!standaloneFlow) {
      return undefined;
    }
    function onError(error: unknown): void {
      log.error('Standalone onboarding promise failed', error);
    }
    // NOTE: every handler below is guarded on the standalone flow. In the link flow, the stock
    // device-join UI resolves the SAME `oppfConfig`/`userPassword` promises; without the guard
    // those resolutions would corrupt the (unrendered) standalone collection state.
    params.oppfConfig
      .then(() => {
        if (onboardingFlowValue !== 'standalone') {
          return;
        }
        standaloneStep =
          standaloneModeValue === 'safe-restore' ? 'restore-from-safe' : 'set-password';
      })
      .catch(onError);
    safeRestoreCredentials
      .then(() => {
        if (onboardingFlowValue !== 'standalone') {
          return;
        }
        standaloneStep = 'set-password';
      })
      .catch(onError);
    params.userPassword
      .then(() => {
        if (onboardingFlowValue !== 'standalone') {
          return;
        }
        // On the create path, let the user set their display name (nickname) BEFORE the optional
        // Safe backup and creation. On the restore path, collection is complete.
        if (standaloneModeValue === 'create') {
          standaloneStep = 'set-display-name';
        } else {
          collectionComplete = true;
        }
      })
      .catch(onError);
    displayName
      .then(() => {
        if (onboardingFlowValue !== 'standalone') {
          return;
        }
        // The user chose a display name or skipped; offer the optional Safe backup BEFORE creation
        // runs (the backup is written inline in the worker).
        standaloneStep = 'back-up-to-safe';
      })
      .catch(onError);
    safeBackupRequest
      .then(() => {
        if (onboardingFlowValue !== 'standalone') {
          return;
        }
        // The user opted in or skipped; the controller now proceeds to create the identity.
        collectionComplete = true;
      })
      .catch(onError);
    const unsubscribeSafeBackupResult = params.safeBackupResult?.subscribe((outcome) => {
      safeBackupResultValue = outcome;
    });
    const unsubscribeCreatedIdentity = params.createdIdentity?.subscribe((identity) => {
      // Only adopt a defined identity. This store is a no-op for the standalone flow (the ID
      // arrives on the `registered` linking state instead); without this guard its initial
      // `undefined` emission would clobber the ID set by the `registered` handler, blanking the
      // success screen.
      if (identity !== undefined) {
        createdIdentityValue = identity;
      }
    });
    return () => {
      unsubscribeSafeBackupResult?.();
      unsubscribeCreatedIdentity?.();
    };
  });

  // Handle backend linking state changes.
  onMount(() =>
    params.linkingState.subscribe((state: LinkingState) => {
      log.info(`Backend linking state changed to ${state.state}`);
      switch (state.state) {
        case 'initializing':
          // Initial state.
          break;
        case 'oppf':
          linkingWizardState = {
            component: 'oppf',
            props: {oppfConfig: params.oppfConfig, services},
          };
          break;
        case 'waiting-for-handshake':
          linkingWizardState = {
            component: 'scan',
            props: {
              joinUri: state.joinUri,
            },
          };
          break;
        case 'nominated':
          linkingWizardState = {
            component: 'confirmEmoji',
            props: {
              rph: state.rph,
            },
          };
          break;
        case 'waiting-for-password':
          linkingWizardState = {
            component: 'setPassword',
            props: {
              userPassword: params.userPassword,
              shouldStorePassword: params.shouldStorePassword,
              isSafeStorageAvailable: params.isSafeStorageAvailable,
            },
          };
          break;
        case 'syncing':
          linkingWizardState = {
            component: 'sync',
            props: {
              phase: state.phase,
            },
          };
          break;
        case 'waiting-for-old-profile-password':
          linkingWizardState = {
            component: 'oldProfilePassword',
            props: {
              services,
              oldPassword: params.oldProfilePassword,
              previouslyEnteredPassword: state.previouslyEnteredPassword,
              state: state.type,
            },
          };
          break;
        case 'restoration-identity-mismatch':
          linkingWizardState = {
            component: 'restorationIdentityMismatch',
            props: {
              accept: params.continueWithoutRestoring,
            },
          };
          break;
        case 'registered':
          // The standalone backend bootstrap reports the created/restored Threema ID on the
          // `registered` state; surface it so SuccessCreated can display it. (The optional
          // `params.createdIdentity` store path is a no-op for the standalone flow.)
          createdIdentityValue = state.identity ?? createdIdentityValue;
          linkingWizardState = {
            component: 'successLinked',
            props: {
              identityReady: params.identityReady,
            },
          };
          break;
        case 'error':
          linkingWizardState = {
            component: 'error',
            props: {
              errorType: state.type,
              errorMessage: state.message,
              publicKeyPinMismatch: params.invalidCertificatePinStore,
              services,
            },
          };
          break;
        default:
          unreachable(state);
      }
    }),
  );
</script>

{#if standaloneFlow && onboardingFlowValue === 'unselected'}
  <!-- Initial flow choice: standalone (own ID) vs link with phone (stock device-join). -->
  <ChooseMode
    onSelectStandalone={handleSelectStandalone}
    onSelectLink={handleSelectLink}
    localeStore={params.localeStore}
  />
{:else if standaloneFlow && onboardingFlowValue === 'standalone' && !collectionComplete}
  <!-- Standalone onboarding: local collection steps (no backend interaction yet). -->
  {#if standaloneStep === 'mode-select'}
    <CreateNewId onCreateNewId={handleCreateNewId} onRestoreFromSafe={handleRestoreFromSafe} />
  {:else if standaloneStep === 'enter-server'}
    <EnterServer oppfConfig={params.oppfConfig} {services} />
  {:else if standaloneStep === 'restore-from-safe'}
    <RestoreFromSafe {safeRestoreCredentials} />
  {:else if standaloneStep === 'set-password'}
    <SetPassword
      userPassword={params.userPassword}
      shouldStorePassword={params.shouldStorePassword}
      isSafeStorageAvailable={params.isSafeStorageAvailable}
    />
  {:else if standaloneStep === 'set-display-name'}
    <SetDisplayName {displayName} />
  {:else if standaloneStep === 'back-up-to-safe'}
    <BackUpToSafe {safeBackupRequest} onSkip={() => safeBackupRequest.resolve(undefined)} />
  {:else}
    {svelteUnreachable(standaloneStep)}
  {/if}
{:else if standaloneFlow && onboardingFlowValue === 'standalone'}
  <!-- Standalone onboarding: backend bootstrap drives `linkingState` from here on. -->
  <!-- (The 'link' choice intentionally falls through to the stock branches below.) -->
  {#if linkingWizardState.component === 'successLinked'}
    <SuccessCreated
      mode={standaloneModeValue}
      identityReady={params.identityReady}
      safeBackupResult={safeBackupResultValue}
      createdIdentity={createdIdentityValue}
    />
  {:else if linkingWizardState.component === 'error'}
    <Error {...linkingWizardState.props} />
  {:else if linkingWizardState.component === 'oldProfilePassword'}
    <OldProfilePassword {...linkingWizardState.props} />
  {:else if linkingWizardState.component === 'restorationIdentityMismatch'}
    <RestorationIdentityMismatch {...linkingWizardState.props} />
  {:else if linkingWizardState.component === 'sync'}
    <Sync {...linkingWizardState.props} />
  {:else}
    <!-- Backend has not progressed past collection yet: show a generic working state. -->
    <Sync phase="loading" />
  {/if}
{:else if linkingWizardState.component === 'oppf'}
  {#if standaloneFlow}
    <!-- The fork's link flow keeps the fork's server-entry UX (host + single activation key)
         instead of the stock URL/username/password modal; both resolve the same `oppfConfig`
         shape via the same validation call. -->
    <EnterServer oppfConfig={params.oppfConfig} {services} />
  {:else}
    <OnPremConfigurationModal {...linkingWizardState.props}></OnPremConfigurationModal>
  {/if}
{:else if linkingWizardState.component === 'scan'}
  <Scan {...linkingWizardState.props} />
{:else if linkingWizardState.component === 'confirmEmoji'}
  <ConfirmEmoji {...linkingWizardState.props} />
{:else if linkingWizardState.component === 'oldProfilePassword'}
  <OldProfilePassword {...linkingWizardState.props} />
{:else if linkingWizardState.component === 'restorationIdentityMismatch'}
  <RestorationIdentityMismatch {...linkingWizardState.props} />
{:else if linkingWizardState.component === 'setPassword'}
  <SetPassword {...linkingWizardState.props} />
{:else if linkingWizardState.component === 'sync'}
  <Sync {...linkingWizardState.props} />
{:else if linkingWizardState.component === 'successLinked'}
  <SuccessLinked {...linkingWizardState.props} />
{:else if linkingWizardState.component === 'error'}
  <Error {...linkingWizardState.props} />
{:else}
  {svelteUnreachable(linkingWizardState)}
{/if}

<style lang="scss">
  @use 'component' as *;
</style>

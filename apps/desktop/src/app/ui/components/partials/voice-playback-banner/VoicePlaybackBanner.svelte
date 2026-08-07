<!--
  @component
  Persistent voice-playback banner (F1Whisper fork).

  A compact mini-player bound to the app-scoped `AudioPlaybackController`. Playback already survives
  conversation switches via that controller; this banner is the visible indicator and remote control
  for it. It appears whenever a (non listen-once) voice message is playing and the user is NOT
  viewing the conversation that owns it. Inside the owning chat the inline player is already visible,
  so the banner is hidden, mirroring the shipped F1Whisper Android banner. Listen-once playback is
  never shown here (it must be heard in context and burned, never replayed from a banner).

  RTL-correct: it uses logical properties and flow order only, so the layout mirrors with the app
  direction.
-->
<script lang="ts">
  import {ROUTE_DEFINITIONS, type RouteInstanceFor} from '~/app/routing/routes';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import {
    getAudioPlaybackController,
    shouldShowVoiceBanner,
    tryAudioPlaybackIdToMessageId,
  } from '~/app/ui/components/molecules/audio-player/controller';
  import type {VoicePlaybackBannerProps} from '~/app/ui/components/partials/voice-playback-banner/props';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {durationToString} from '~/common/utils/date';

  type ConversationReceiverLookup = RouteInstanceFor<
    'main',
    'conversation'
  >['params']['receiverLookup'];

  const {services}: VoicePlaybackBannerProps = $props();
  const {router} = services;

  const controller = getAudioPlaybackController();
  const playback = controller.state;

  // The conversation that owns the currently-playing message, captured from the router at the moment
  // playback starts. Playback always starts from the visible inline player inside that conversation,
  // so the router's main route at that instant IS the owning conversation. Used to (a) hide the
  // banner while the user is viewing the owning chat and (b) jump back to the message. `undefined`
  // when playback started outside a conversation (then the banner has no jump target).
  let owningLookup = $state<ConversationReceiverLookup | undefined>(undefined);

  // Plain (non-reactive) marker of the playback the owning lookup was captured for, so the capture
  // runs exactly once per playback and NOT on every position tick or route change.
  let capturedForId: bigint | undefined = undefined;

  const activeId = $derived($playback.activeId);

  $effect(() => {
    const id = activeId;
    if (id === undefined) {
      owningLookup = undefined;
      capturedForId = undefined;
      return;
    }
    if (id === capturedForId) {
      return;
    }
    capturedForId = id;
    // Non-reactive read: capture the route as it is NOW; do not re-run when the user navigates away.
    const main = router.get().main;
    owningLookup = main.id === 'conversation' ? main.params.receiverLookup : undefined;
  });

  const currentMain = $derived($router.main);
  const isViewingOwningConversation = $derived(
    owningLookup !== undefined &&
      currentMain.id === 'conversation' &&
      currentMain.params.receiverLookup.type === owningLookup.type &&
      currentMain.params.receiverLookup.uid === owningLookup.uid,
  );

  const show = $derived(
    shouldShowVoiceBanner({
      hasActivePlayback: activeId !== undefined,
      isListenOnce: $playback.isListenOnce,
      isViewingOwningConversation,
    }),
  );

  const isPaused = $derived($playback.paused);
  const playbackSpeed = $derived($playback.playbackSpeed);
  const progressFraction = $derived(
    $playback.duration > 0 ? Math.min($playback.currentTime / $playback.duration, 1) : 0,
  );
  const remainingLabel = $derived(
    durationToString(Math.max(Math.round($playback.duration - $playback.currentTime), 0)),
  );

  // Neutral label: the owning conversation's display name is not available without threading playback
  // context through the (non-owned) message component tree, so a neutral label is used (matching the
  // Android banner's default). Tapping the banner still jumps to the exact message.
  const label = $derived($i18n.t('messaging.label--voice-message', 'Voice message'));

  function handleTogglePlayPause(): void {
    controller.togglePlayPause();
  }

  function handleCycleSpeed(): void {
    controller.cycleSpeed();
  }

  function handleClose(): void {
    controller.stop();
  }

  function handleJump(): void {
    const lookup = owningLookup;
    if (lookup === undefined || activeId === undefined) {
      return;
    }
    const messageId = tryAudioPlaybackIdToMessageId(activeId);
    if (messageId === undefined) {
      return;
    }
    router.go({
      main: ROUTE_DEFINITIONS.main.conversation.withParams({
        receiverLookup: lookup,
        initialMessage: {messageId},
      }),
    });
  }
</script>

{#if show}
  <div class="voice-playback-banner">
    <button
      class="control play"
      onclick={handleTogglePlayPause}
      title={isPaused
        ? $i18n.t('messaging.action--voice-banner-play', 'Play')
        : $i18n.t('messaging.action--voice-banner-pause', 'Pause')}
    >
      <MdIcon theme="Filled">{isPaused ? 'play_arrow' : 'pause'}</MdIcon>
    </button>

    <button
      class="body"
      disabled={owningLookup === undefined}
      onclick={handleJump}
      title={$i18n.t('messaging.hint--voice-banner-jump', 'Go to message')}
    >
      <span class="label">
        <Text color="mono-high" ellipsis={true} size="body" text={label} wrap={false} />
      </span>
      <span class="meta">
        <span class="track">
          <span class="fill" style:inline-size={`${progressFraction * 100}%`}></span>
        </span>
        <span class="time">
          <Text color="mono-low" size="body-small" text={remainingLabel} wrap={false} />
        </span>
      </span>
    </button>

    <button class="control speed" onclick={handleCycleSpeed}>
      <Text color="mono-low" family="secondary" text={`${playbackSpeed}x`} wrap={false} />
    </button>

    <button
      class="control close"
      onclick={handleClose}
      title={$i18n.t('messaging.action--voice-banner-close', 'Stop playback')}
    >
      <MdIcon theme="Filled">close</MdIcon>
    </button>
  </div>
{/if}

<style lang="scss">
  @use 'component' as *;

  .voice-playback-banner {
    // Fixed top overlay (not a grid panel), mirroring the call-activity overlay pattern, so the
    // banner never disturbs the app's grid layout and floats above the panels on every layout size.
    position: fixed;
    // Sit ABOVE the conversation chrome: the conversation header / top bar (`.header`) and the panel
    // chrome resolve to z-index 1 in the ROOT stacking context (no stacking-context ancestor between
    // them and the root), and being later in the DOM than this banner they would win the equal-z tie
    // and hide it. Use 2 (the minimal value strictly above that chrome). Stay BELOW
    // $z-index-global-overlay (10) and $z-index-modal (100) so a global overlay or modal still covers
    // the banner. Raw int matches the house convention for the 1 < z < 10 range (e.g. ConversationView
    // `.private { z-index: 2 }`, which spans the body region and never overlaps this top banner).
    z-index: 2;
    inset-block-start: rem(12px);
    inset-inline-start: 50%;
    transform: translateX(-50%);
    width: min(rem(440px), calc(100% - #{rem(32px)}));

    display: flex;
    align-items: center;
    gap: rem(8px);

    padding: rem(6px) rem(10px);
    border: 1px solid var(--t-panel-gap-color);
    border-radius: rem(12px);
    background-color: var(--t-nav-background-color);
    box-shadow: 0 rem(2px) rem(10px) rgb(0 0 0 / 22%);

    // Slide in from the top on mount, mirroring the house banner behaviour.
    animation: slide-from-top 0.15s ease-out;

    .control {
      @include clicktarget-button-circle;

      & {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--t-color-primary);
        background-color: transparent;
        border: none;
      }

      &.play {
        width: rem(36px);
        height: rem(36px);
        font-size: rem(24px);
      }

      &.speed {
        width: rem(40px);
        height: rem(28px);
        border-radius: rem(11px);
        color: var(--t-text-e2-color);
      }

      &.close {
        width: rem(30px);
        height: rem(30px);
        font-size: rem(18px);
        color: var(--t-text-e2-color);
      }
    }

    .body {
      flex: 1 1 auto;
      min-width: 0;

      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: rem(3px);

      padding: rem(2px) rem(4px);
      border: none;
      border-radius: rem(6px);
      background-color: transparent;
      cursor: pointer;
      text-align: start;

      &:disabled {
        cursor: default;
      }

      &:not(:disabled):hover {
        background-color: var(--ic-list-element-background-color--hover);
      }

      .label {
        min-width: 0;
        overflow: hidden;
      }

      .meta {
        display: flex;
        align-items: center;
        gap: rem(8px);

        .track {
          position: relative;
          flex: 1 1 auto;
          min-width: 0;
          height: rem(3px);
          border-radius: rem(2px);
          overflow: hidden;
          background-color: var(--t-panel-gap-color);

          .fill {
            position: absolute;
            inset-block: 0;
            inset-inline-start: 0;
            border-radius: rem(2px);
            background-color: var(--t-color-primary);
          }
        }

        .time {
          flex: none;
          font-variant-numeric: tabular-nums;
        }
      }
    }
  }

  @keyframes slide-from-top {
    from {
      opacity: 0;
      transform: translateY(rem(-12px));
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>

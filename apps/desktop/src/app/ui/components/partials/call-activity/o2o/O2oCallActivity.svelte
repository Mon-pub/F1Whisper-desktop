<!--
  @component Renders the in-call screen for an ongoing 1:1 (o2o) audio call.

  Mirrors `GroupCallActivity`, but drastically simplified: there is a single remote peer, the call is
  audio-only (no video panel, no participant grid, no device chooser), and the whole surface is
  driven by the o2o call view model bundle's `state` store (see `getOngoingO2oCallViewModelBundle`).
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Timer from '~/app/ui/components/atoms/timer/Timer.svelte';
  import type {O2oCallActivityProps} from '~/app/ui/components/partials/call-activity/o2o/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {call, services}: O2oCallActivityProps = $props();

  const log = globals.unwrap().uiLogging.logger('ui.component.o2o-call-activity');

  // Auto-subscribe to the remote call state store. `call.state` is a `RemoteStore`; the
  // `callStateStore` alias (NOT named `state`, which would collide with the `$state` rune) lets us
  // reactively read the o2o call state view model via `$callStateStore`.
  const callStateStore = $derived(call.state);

  const status = $derived($callStateStore.call.status);
  const micMuted = $derived($callStateStore.call.micMuted);
  const peerRinging = $derived($callStateStore.call.peerRinging === true);
  const peer = $derived($callStateStore.peer);

  // `connectedAt` is only present in the `connected` / `reconnecting` states; used to drive the
  // running call-duration timer.
  const connectedAt = $derived(
    $callStateStore.call.status === 'connected' || $callStateStore.call.status === 'reconnecting'
      ? $callStateStore.call.connectedAt
      : undefined,
  );

  function handleClickToggleMute(): void {
    // `setMuted` crosses the worker<->DOM proxy boundary and returns a Promise; fire-and-forget.
    Promise.resolve(call.controller.setMuted(!micMuted)).catch((error: unknown) => {
      log.warn('Failed to toggle mute:', error);
    });
  }

  function handleClickHangup(): void {
    Promise.resolve(call.controller.hangup()).catch((error: unknown) => {
      log.warn('Failed to hang up:', error);
    });
  }
</script>

<div class="container">
  <div class="peer">
    {#if peer !== undefined}
      <div class="avatar">
        <ProfilePicture options={{isClickable: false}} receiver={peer} {services} size="lg" />
      </div>
      <span class="name">{peer.name}</span>
    {/if}

    <span class="status">
      {#if status === 'ringing-out'}
        {#if peerRinging}
          {$i18n.t('messaging.label--o2o-call-ringing', 'Ringing…')}
        {:else}
          {$i18n.t('messaging.label--o2o-call-ringing-out', 'Calling…')}
        {/if}
      {:else if status === 'connecting'}
        {$i18n.t('messaging.label--o2o-call-connecting', 'Connecting…')}
      {:else if status === 'connected'}
        {#if connectedAt !== undefined}
          <Timer from={connectedAt} />
        {/if}
      {:else if status === 'reconnecting'}
        {$i18n.t('messaging.label--o2o-call-reconnecting', 'Reconnecting…')}
      {:else if status === 'ended'}
        {$i18n.t('messaging.label--o2o-call-ended', 'Call ended')}
      {/if}
    </span>
  </div>

  <!--
    TODO(o2o-audio-level): A remote-peer speaking indicator / audio-level bar was deferred (see
    `OngoingO2oCallController` note): `remoteAudioLevel` is not on the controller yet because it
    needs a store-specific transfer path across the worker<->DOM proxy. Add it here once exposed.
  -->

  <div class="controls">
    <button
      class="toggle"
      class:enabled={!micMuted}
      onclick={handleClickToggleMute}
      title={micMuted
        ? $i18n.t('messaging.action--o2o-call-unmute', 'Unmute microphone')
        : $i18n.t('messaging.action--o2o-call-mute', 'Mute microphone')}
    >
      <MdIcon theme="Outlined">
        {#if micMuted}
          mic_off
        {:else}
          mic
        {/if}
      </MdIcon>
    </button>

    <button
      class="toggle destructive"
      onclick={handleClickHangup}
      title={$i18n.t('messaging.action--o2o-call-hangup', 'End call')}
    >
      <MdIcon theme="Outlined">call_end</MdIcon>
    </button>
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    height: 100%;
    padding: rem(24px) rem(16px);

    background-color: rgb(38, 38, 38);
    color: white;

    .peer {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: rem(12px);

      flex: 1 1 auto;
      min-height: 0;
      text-align: center;

      .avatar {
        // Reset the profile picture's default click affordances in this read-only context.
        pointer-events: none;
      }

      .name {
        font-size: rem(20px);
        line-height: rem(24px);
        font-weight: 600;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .status {
        font-size: rem(14px);
        line-height: rem(18px);
        color: rgb(180, 180, 180);
      }
    }

    .controls {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: rem(16px);

      flex: 0 0 auto;
      padding-top: rem(16px);

      .toggle {
        @extend %neutral-input;

        display: flex;
        align-items: center;
        justify-content: center;

        padding: rem(14px);
        font-size: rem(24px);
        line-height: rem(24px);
        border-radius: 50%;

        color: white;
        background-color: rgb(60, 60, 60);

        &:hover {
          cursor: pointer;
          background-color: rgb(72, 72, 72);
        }

        &.enabled {
          background-color: rgb(25, 209, 84);

          &:hover {
            background-color: rgb(24, 181, 73);
          }
        }

        &.destructive {
          background-color: rgb(255, 0, 0);

          &:hover {
            background-color: rgb(217, 8, 8);
          }
        }
      }
    }
  }
</style>

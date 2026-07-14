<!--
  @component Renders the incoming-call ring overlay for a 1:1 (o2o) audio call.

  Shown while the o2o call is in the `ringing-in` state. Presents the caller's avatar + name, an
  "Incoming call" prompt, and Accept / Decline actions. While mounted it raises attention through a
  looping ringtone (synthesised via the Web Audio API, so no new asset ships) and an OS notification.

  The overlay does NOT dismiss itself: it is mounted/unmounted by the App shell purely based on the
  ongoing-call store (rendered iff the call exists and its status is `ringing-in`). Accepting or
  declining transitions the backend state, which unmounts this component.
-->
<script lang="ts">
  import {onDestroy, onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {IncomingCallO2oProps} from '~/app/ui/components/partials/call-activity/o2o/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {call, services}: IncomingCallO2oProps = $props();

  const log = globals.unwrap().uiLogging.logger('ui.component.o2o-incoming-call');

  // `callStateStore` (NOT `state`, which collides with the `$state` rune) auto-subscribes to the
  // remote call state view model store.
  const callStateStore = $derived(call.state);
  const peer = $derived($callStateStore.peer);

  function handleClickAccept(): void {
    Promise.resolve(call.controller.accept()).catch((error: unknown) => {
      log.warn('Failed to accept incoming call:', error);
    });
  }

  function handleClickDecline(): void {
    Promise.resolve(call.controller.hangup()).catch((error: unknown) => {
      log.warn('Failed to decline incoming call:', error);
    });
  }

  // ------------------------------------------------------------------
  // Ringtone (synthesised, looping) + OS notification while ringing.
  // ------------------------------------------------------------------

  let audioContext: AudioContext | undefined;
  let ringInterval: ReturnType<typeof setInterval> | undefined;
  let notification: Notification | undefined;

  /** Play one short two-tone "ring" chirp through the Web Audio API. */
  function playRingChirp(): void {
    if (audioContext === undefined) {
      return;
    }
    const now = audioContext.currentTime;
    for (const [index, frequency] of [440, 480].entries()) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      // Gentle attack/release envelope so the tone doesn't click.
      const start = now + index * 0.4;
      const end = start + 0.35;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(end);
    }
  }

  function startRinging(): void {
    try {
      audioContext = new AudioContext();
      playRingChirp();
      // Repeat the chirp roughly every 3 seconds, mirroring a phone ring cadence.
      ringInterval = setInterval(playRingChirp, 3000);
    } catch (error) {
      log.warn('Failed to start ringtone:', error);
    }
  }

  function stopRinging(): void {
    if (ringInterval !== undefined) {
      clearInterval(ringInterval);
      ringInterval = undefined;
    }
    if (audioContext !== undefined) {
      audioContext.close().catch(() => {
        // Ignore close failures.
      });
      audioContext = undefined;
    }
  }

  function raiseNotification(name: string | undefined): void {
    // Best-effort: only if the user already granted notification permission (we don't prompt here).
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }
    try {
      notification = new Notification(
        $i18n.t('messaging.label--o2o-call-incoming', 'Incoming call'),
        {
          body: name,
          silent: true,
          requireInteraction: true,
        },
      );
      notification.addEventListener('click', () => window.focus());
    } catch (error) {
      log.debug('Failed to raise incoming-call notification:', error);
    }
  }

  onMount(() => {
    startRinging();
    raiseNotification(peer?.name);
  });

  onDestroy(() => {
    stopRinging();
    notification?.close();
    notification = undefined;
  });
</script>

<Modal
  wrapper={{type: 'none'}}
  options={{
    allowClosingWithEsc: false,
    overlay: 'opaque',
  }}
>
  <div class="ring">
    {#if peer !== undefined}
      <div class="avatar">
        <ProfilePicture options={{isClickable: false}} receiver={peer} {services} size="lg" />
      </div>
      <span class="name">{peer.name}</span>
    {/if}

    <span class="prompt">
      {$i18n.t('messaging.label--o2o-call-incoming', 'Incoming call')}
    </span>

    <div class="actions">
      <button
        class="action decline"
        onclick={handleClickDecline}
        title={$i18n.t('messaging.action--o2o-call-decline', 'Decline')}
      >
        <MdIcon theme="Outlined">call_end</MdIcon>
      </button>
      <button
        class="action accept"
        onclick={handleClickAccept}
        title={$i18n.t('messaging.action--o2o-call-accept', 'Accept')}
      >
        <MdIcon theme="Outlined">call</MdIcon>
      </button>
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .ring {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: rem(16px);

    padding: rem(48px) rem(24px);
    color: white;
    text-align: center;

    .avatar {
      pointer-events: none;
    }

    .name {
      font-size: rem(24px);
      line-height: rem(28px);
      font-weight: 600;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .prompt {
      font-size: rem(16px);
      line-height: rem(20px);
      color: rgb(180, 180, 180);
    }

    .actions {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: rem(48px);

      padding-top: rem(24px);

      .action {
        @extend %neutral-input;

        display: flex;
        align-items: center;
        justify-content: center;

        padding: rem(18px);
        font-size: rem(28px);
        line-height: rem(28px);
        border-radius: 50%;

        color: white;
        cursor: pointer;

        &.accept {
          background-color: rgb(25, 209, 84);

          &:hover {
            background-color: rgb(24, 181, 73);
          }
        }

        &.decline {
          background-color: rgb(255, 0, 0);

          &:hover {
            background-color: rgb(217, 8, 8);
          }
        }
      }
    }
  }
</style>

<script lang="ts">
  import {onMount, tick} from 'svelte';

  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import {i18n} from '~/app/ui/i18n';
  import type {LinkingWizardOldProfilePasswordProps} from '~/app/ui/linking';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {assertUnreachable} from '~/common/utils/assert';
  import {ResolvablePromise} from '~/common/utils/resolvable-promise';

  let {
    oldPassword,
    onclose,
    services,
    state: linkingState,
    previouslyEnteredPassword,
  }: LinkingWizardOldProfilePasswordProps = $props();

  let password = $state<string>('');
  let passwordInput = $state<SvelteNullableBinding<Password>>(null);
  let handlerPromise = $state<ResolvablePromise<void> | undefined>(undefined);

  async function handleSubmit(): Promise<void> {
    handlerPromise = new ResolvablePromise<void>({uncaught: 'default'});
    oldPassword.resolve(password);
    previouslyEnteredPassword = undefined;
    return await handlerPromise;
  }

  $effect(() => {
    if (previouslyEnteredPassword !== undefined && linkingState === 'default') {
      handlerPromise?.resolve();
      handlerPromise = undefined;
    }
  });

  async function handleReject(): Promise<void> {
    handlerPromise = new ResolvablePromise<void>({uncaught: 'default'});
    oldPassword.resolve(undefined);
    return await handlerPromise;
  }

  let error = $derived(
    previouslyEnteredPassword === undefined
      ? undefined
      : $i18n.t(
          'dialog--linking-old-profile-password.error--incorrect-password',
          'The entered password is incorrect. Please try again.',
        ),
  );

  onMount(() => {
    // Sanity check. This component should not be mounted from the backend when no old profile is
    // present.
    const oldProfile = services.electron.getLatestProfilePath();
    if (oldProfile === undefined) {
      oldPassword.resolve(undefined);
    }

    tick()
      .then(() => passwordInput?.focusAndSelect())
      .catch(assertUnreachable);
  });
</script>

<Modal
  {onclose}
  onsubmit={handleSubmit}
  options={{
    allowClosingWithEsc: false,
    allowSubmittingWithEnter: true,
  }}
  wrapper={{
    type: 'card',
    buttons: [
      {
        disabled: handlerPromise !== undefined,
        label: $i18n.t('dialog--linking-old-profile-password.label--skip-restoration', 'Skip'),
        onclick: handleReject,
        type: 'naked',
      },
      {
        disabled: handlerPromise !== undefined,
        label: $i18n.t('dialog--linking-old-profile-password.action--confirm', 'Restore Messages'),
        onclick: handleSubmit,
        type: 'filled',
      },
    ],
    title: $i18n.t('dialog--linking-old-profile-password.label--title', 'Restore Messages'),
    maxWidth: 460,
  }}
>
  <div class="content">
    <div class="description">
      <Text
        text={$i18n.t(
          'dialog--linking-old-profile-password.prose--intro',
          'Previous chats were found. To restore them, please enter the corresponding password. If you skip this step, the old chats will be deleted irrevocably.',
        )}
      />
    </div>
    <div class="input">
      <Password
        bind:this={passwordInput}
        bind:value={password}
        disabled={handlerPromise !== undefined}
        {error}
        label={$i18n.t('dialog--linking-old-profile-password.label--old-password', 'Password')}
        oninput={() => {
          error = undefined;
        }}
      />
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    .description {
      padding: 0 rem(16px);
    }
    .input {
      padding: rem(12px) rem(16px);
    }
  }
</style>

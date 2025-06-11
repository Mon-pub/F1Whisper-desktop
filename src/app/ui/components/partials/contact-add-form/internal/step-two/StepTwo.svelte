<script lang="ts">
  import {onMount} from 'svelte';

  import type {StepTwoProps} from '~/app/ui/components/partials/contact-add-form/internal/step-two/props';
  import TopBar from '~/app/ui/components/partials/contact-add-form/internal/top-bar/TopBar.svelte';
  import HiddenSubmit from '~/app/ui/generic/form/HiddenSubmit.svelte';
  import ProfilePictureUpload from '~/app/ui/generic/profile-picture/ProfilePictureUpload.svelte';
  import {i18n} from '~/app/ui/i18n';
  import WizardButton from '~/app/ui/svelte-components/blocks/Button/WizardButton.svelte';
  import Text from '~/app/ui/svelte-components/blocks/Input/Text.svelte';
  import {MAX_CONTACT_NAME_BYTES} from '~/app/ui/utils/constants';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {UTF8} from '~/common/utils/codec';
  import {TIMER} from '~/common/utils/timer';

  let {
    contact = $bindable(),
    identity,
    onclickback,
    onclickcancel,
    oncontinue,
  }: StepTwoProps = $props();

  let firstName = $state<string>('');
  let lastName = $state<string>('');
  let contactFirstNameInputComponent = $state<SvelteNullableBinding<Text>>();

  let firstNameByteSize = $state(0);
  let lastNameByteSize = $state(0);

  let continueButtonDisabled = $state(false);

  const handleMutation = TIMER.debounce(() => {
    firstNameByteSize = UTF8.encode(firstName).byteLength;
    lastNameByteSize = UTF8.encode(lastName).byteLength;
  }, 200);

  onMount(() => {
    contactFirstNameInputComponent?.focus();
  });
</script>

<form
  class="container"
  onsubmit={(event) => {
    event.preventDefault();
    continueButtonDisabled = true;
    oncontinue?.(contact, firstName, lastName);
    continueButtonDisabled = false;
  }}
  oninput={handleMutation}
>
  <HiddenSubmit />
  <div class="bar">
    <TopBar {onclickback} {onclickcancel} />
  </div>

  <div class="content">
    <span class="profile-picture-upload">
      <ProfilePictureUpload />
    </span>
    <div class="threema-id">
      <Text
        disabled={true}
        value={identity}
        label={$i18n.t('contacts.label--threema-id', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
      />
    </div>
    <div class="firstname">
      <Text
        bind:this={contactFirstNameInputComponent}
        bind:value={firstName}
        label={$i18n.t('contacts.label--first-name', 'First Name')}
        spellcheck={false}
      />
    </div>
    <div class="lastname">
      <Text
        bind:value={lastName}
        label={$i18n.t('contacts.label--last-name', 'Last Name')}
        spellcheck={false}
      />
    </div>
  </div>

  <div class="next">
    <WizardButton
      onclick={() => {
        continueButtonDisabled = true;
        oncontinue?.(contact, firstName, lastName);
        continueButtonDisabled = false;
      }}
      disabled={firstNameByteSize > MAX_CONTACT_NAME_BYTES ||
        lastNameByteSize > MAX_CONTACT_NAME_BYTES ||
        continueButtonDisabled}
      >{$i18n.t('common.action--next', 'Next')}
    </WizardButton>
  </div>
</form>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    background-color: var(--t-nav-background-color);
    grid-template:
      'bar' rem(64px)
      'content' auto
      '.' 1fr
      'next' rem(64px);
    align-content: start;
    overflow: hidden;
    height: 100%;

    .bar {
      grid-area: bar;

      padding: rem(12px) rem(8px);
    }

    .content {
      grid-area: content;

      overflow-y: auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: start;
      gap: rem(8px);

      .profile-picture-upload,
      .threema-id,
      .firstname,
      .lastname {
        padding: 0 rem(16px);
      }
      .profile-picture-upload {
        place-self: center;
      }
    }

    .next {
      grid-area: next;

      display: grid;
      grid-area: next;
      background-color: var(--t-color-primary);
      align-self: stretch;
      grid-template: 'text' / auto;
      justify-items: end;
      align-items: center;
      padding: 0 rem(8px);
    }
  }
</style>

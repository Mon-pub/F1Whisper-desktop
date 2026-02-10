<script lang="ts">
  import {globals} from '~/app/globals';
  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {EditContactModalProps} from '~/app/ui/components/partials/modals/edit-contact-modal/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {MAX_CONTACT_NAME_BYTES} from '~/app/ui/utils/constants';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {UTF8} from '~/common/utils/codec';
  import {TIMER} from '~/common/utils/timer';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.edit-contact-modal');

  const {onclose, receiver, services}: EditContactModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  let firstNameInputValue = $state<string>(receiver.firstName);
  let lastNameInputValue = $state<string>(receiver.lastName);

  let firstNameByteSize = $state(UTF8.encode(receiver.firstName).byteLength);
  let lastNameByteSize = $state(UTF8.encode(receiver.lastName).byteLength);

  const handleMutation = TIMER.debounce(() => {
    firstNameByteSize = UTF8.encode(firstNameInputValue).byteLength;
    lastNameByteSize = UTF8.encode(lastNameInputValue).byteLength;
  }, 200);

  async function handleSubmit(): Promise<void> {
    if (firstNameInputValue === receiver.firstName && lastNameInputValue === receiver.lastName) {
      modalComponent?.close();
      return;
    }

    // Reject names that are too long.
    const firstNameLength = UTF8.encode(firstNameInputValue).byteLength;
    const lastNameLength = UTF8.encode(lastNameInputValue).byteLength;
    if (firstNameLength > MAX_CONTACT_NAME_BYTES || lastNameLength > MAX_CONTACT_NAME_BYTES) {
      firstNameByteSize = firstNameLength;
      lastNameByteSize = lastNameLength;
      return;
    }

    await receiver
      .edit({
        type: 'contact',
        firstName: firstNameInputValue,
        lastName: lastNameInputValue,
      })
      .then(() => {
        toast.addSimpleSuccess(
          $i18n.t('dialog--edit-contact.success--edit-contact', 'Contact successfully edited'),
        );
      })
      .catch((error: unknown) => {
        log.error(`Failed to update contact: ${error}`);

        toast.addSimpleFailure(
          $i18n.t('dialog--edit-contact.error--edit-contact', 'Failed to edit contact'),
        );
      });
    modalComponent?.close();
  }
</script>

<Modal
  bind:this={modalComponent}
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
    buttons: [
      {
        label: $i18n.t('dialog--common.action--cancel', 'Cancel'),
        type: 'naked',
        onclick: 'close',
      },
      {
        label: $i18n.t('dialog--common.action--ok', 'OK'),
        onclick: 'submit',
        type: 'filled',
        disabled:
          firstNameByteSize > MAX_CONTACT_NAME_BYTES || lastNameByteSize > MAX_CONTACT_NAME_BYTES,
      },
    ],
    title: $i18n.t('dialog--edit-contact.label--title', 'Edit {name}', {
      name: receiver.name,
    }),
    maxWidth: 460,
  }}
  {onclose}
  onsubmit={handleSubmit}
  options={{
    allowSubmittingWithEnter: true,
  }}
>
  <div class="content">
    <div class="profile-picture">
      <ProfilePicture
        {receiver}
        {services}
        options={{
          isClickable: false,
        }}
        size="lg"
      />
    </div>

    <div class="inputs">
      <Input
        bind:value={firstNameInputValue}
        oninput={handleMutation}
        autofocus
        id="first-name"
        label={$i18n.t('dialog--edit-contact.label--first-name', 'First Name')}
      />
      <Input
        bind:value={lastNameInputValue}
        oninput={handleMutation}
        autofocus
        id="last-name"
        label={$i18n.t('dialog--edit-contact.label--last-name', 'Last Name')}
      />
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;
    gap: rem(16px);

    padding: 0 rem(16px);

    .profile-picture {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
    }

    .inputs {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: start;
      gap: rem(8px);
    }
  }
</style>

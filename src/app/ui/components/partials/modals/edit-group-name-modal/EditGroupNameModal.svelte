<script lang="ts">
  import {globals} from '~/app/globals';
  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {EditGroupNameModalProps} from '~/app/ui/components/partials/modals/edit-group-name-modal/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {MAX_GROUP_NAME_BYTES} from '~/app/ui/utils/constants';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {UTF8} from '~/common/utils/codec';
  import {TIMER} from '~/common/utils/timer';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.edit-group-name-modal');

  const {onclose, receiver, services}: EditGroupNameModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  let groupNameInputValue = $state(receiver.name);
  let groupNameByteSize = $state(UTF8.encode(receiver.name).byteLength);

  let submitButtonLoading = $state(false);

  const handleMutation = TIMER.debounce(
    () => (groupNameByteSize = UTF8.encode(groupNameInputValue).byteLength),
    200,
    true,
  );

  async function handleSubmit(): Promise<void> {
    if (groupNameInputValue === receiver.name) {
      modalComponent?.close();
      return;
    }

    const groupNameLength = UTF8.encode(groupNameInputValue).byteLength;
    // Reject group names that are too long.
    if (groupNameLength > MAX_GROUP_NAME_BYTES) {
      groupNameByteSize = groupNameLength;
      return;
    }

    submitButtonLoading = true;

    await receiver
      .edit({
        type: 'group',
        name: groupNameInputValue,
      })
      .then((success) => {
        if (success) {
          toast.addSimpleSuccess(
            $i18n.t(
              'dialog--edit-group.success--edit-group-name',
              'Group name successfully edited',
            ),
          );
          return;
        }
        $i18n.t('dialog--edit-group.error--edit-group', 'Failed to edit group');
      })
      .catch((error) => {
        log.error(`Failed to update group: ${error}`);
        toast.addSimpleFailure(
          $i18n.t('dialog--edit-group.error--edit-group', 'Failed to edit group'),
        );
      });

    submitButtonLoading = false;
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
        disabled: groupNameByteSize > MAX_GROUP_NAME_BYTES,
        state: submitButtonLoading ? 'loading' : 'default',
      },
    ],
    title: $i18n.t('dialog--edit-group.label--title', 'Edit Group', {
      name: receiver.name,
    }),
    maxWidth: 460,
  }}
  options={{
    allowSubmittingWithEnter: true,
  }}
  onsubmit={handleSubmit}
  {onclose}
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
        bind:value={groupNameInputValue}
        oninput={handleMutation}
        autofocus
        id="group-name"
        label={$i18n.t('dialog--edit-group.label--group-name', 'Group Name')}
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

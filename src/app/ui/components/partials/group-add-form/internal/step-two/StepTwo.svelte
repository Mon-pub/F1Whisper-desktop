<script lang="ts">
  import {onMount} from 'svelte';

  import type {StepTwoProps} from '~/app/ui/components/partials/group-add-form/internal/step-two/props';
  import TopBar from '~/app/ui/components/partials/group-add-form/internal/top-bar/TopBar.svelte';
  import ReceiverPreviewList from '~/app/ui/components/partials/receiver-preview-list/ReceiverPreviewList.svelte';
  import type {ReceiverPreviewListItem} from '~/app/ui/components/partials/receiver-preview-list/props';
  import HiddenSubmit from '~/app/ui/generic/form/HiddenSubmit.svelte';
  import ProfilePictureUpload from '~/app/ui/generic/profile-picture/ProfilePictureUpload.svelte';
  import {i18n} from '~/app/ui/i18n';
  import WizardButton from '~/app/ui/svelte-components/blocks/Button/WizardButton.svelte';
  import Text from '~/app/ui/svelte-components/blocks/Input/Text.svelte';
  import {MAX_GROUP_NAME_BYTES} from '~/app/ui/utils/constants';
  import {assertUnreachable} from '~/common/utils/assert';
  import {UTF8} from '~/common/utils/codec';
  import {TIMER} from '~/common/utils/timer';

  let {
    contacts,
    groupName = $bindable(),
    onclickback,
    onclickcancel,
    oncontinue,
    selectedMembers,
    services,
  }: StepTwoProps = $props();

  let groupNameComponent: Text;
  let groupNameByteLength = $state(0);

  let continueButtonDisabled = $state(false);

  const handleMutation = TIMER.debounce(
    () => (groupNameByteLength = UTF8.encode(groupName).byteLength),
    200,
    true,
  );

  const filteredContacts = $derived<ReceiverPreviewListItem<unknown>[]>(
    contacts
      .filter(
        (contact) =>
          contact.receiver.type === 'contact' && selectedMembers.has(contact.receiver.lookup.uid),
      )
      .map((contact) => ({
        ...contact,
        interaction: {mode: 'none'},
      })),
  );

  onMount(() => {
    groupNameComponent.focus();
  });
</script>

<form
  class="container"
  onsubmit={(event) => {
    event.preventDefault();
    continueButtonDisabled = true;
    oncontinue(groupName)
      .then(() => (continueButtonDisabled = false))
      .catch(assertUnreachable);
  }}
>
  <HiddenSubmit />
  <div class="bar">
    <TopBar {onclickback} {onclickcancel} />
  </div>

  <div class="content">
    <span class="profile-picture-upload">
      <ProfilePictureUpload />
    </span>
    <div class="groupname">
      <Text
        bind:this={groupNameComponent}
        bind:value={groupName}
        oninput={handleMutation}
        label={$i18n.t('groups.label--group-name', 'Group Name')}
        spellcheck={false}
      />
    </div>
    <div class="list">
      <div class="heading">
        {$i18n.t(
          'groups.label--group-members',
          '{n, plural, =0 {No Group Members} =1 {Group Member} other {Group Members}}',
          {n: filteredContacts.length},
        )}
      </div>
      {#if filteredContacts.length > 0}
        <ReceiverPreviewList items={filteredContacts} {services} />
      {/if}
    </div>
  </div>
  <div class="next">
    <WizardButton
      onclick={() => {
        oncontinue(groupName).catch(assertUnreachable);
      }}
      disabled={groupNameByteLength > MAX_GROUP_NAME_BYTES || continueButtonDisabled}
    >
      {$i18n.t('common.action--next', 'Next')}
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
      .groupname {
        padding: 0 rem(16px);
      }
      .profile-picture-upload {
        place-self: center;
      }

      .list {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: start;

        .heading {
          @extend %font-small-400;

          color: var(--t-text-e2-color);
          padding: rem(10px) rem(16px);
        }
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

<script lang="ts">
  import {UTF8} from '@threema/ts-utils/codec/utf8';
  import {SvelteSet} from 'svelte/reactivity';

  import {globals} from '~/app/globals';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import StepOne from '~/app/ui/components/partials/group-add-form/internal/step-one/StepOne.svelte';
  import StepTwo from '~/app/ui/components/partials/group-add-form/internal/step-two/StepTwo.svelte';
  import type {GroupAddFormProps} from '~/app/ui/components/partials/group-add-form/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {MAX_GROUP_NAME_BYTES} from '~/app/ui/utils/constants';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';
  import type {DbContactUid} from '~/common/db';
  import {ReceiverType} from '~/common/enum';
  import type {ContactReceiverData} from '~/common/viewmodel/utils/receiver';

  const log = globals.unwrap().uiLogging.logger('ui.component.group-add-form');

  const {actions, contacts, onclickcancel, onclickformcancel, services}: GroupAddFormProps =
    $props();

  const selectedContacts = new SvelteSet<DbContactUid>();

  let currentStep = $state<'step-one' | 'step-two'>('step-one');
  let groupName: string = $state('');

  function handleStepOneNextClicked(): void {
    currentStep = 'step-two';
  }

  function handleClickBackFromStepTwo(): void {
    currentStep = 'step-one';
  }

  function handleSelectReceiver(selected: boolean, receiver: ContactReceiverData): void {
    if (selected) {
      selectedContacts.add(receiver.lookup.uid);
    } else {
      selectedContacts.delete(receiver.lookup.uid);
    }
  }

  async function handleStepTwoNextClicked(
    groupName_: string,
    profilePictureBlob: Blob | undefined,
  ): Promise<void> {
    if (UTF8.encode(groupName_).byteLength > MAX_GROUP_NAME_BYTES) {
      return;
    }

    const profilePictureBytes = await profilePictureBlob?.arrayBuffer();
    const groupUid = await actions
      .createGroup?.(
        {name: groupName_},
        selectedContacts,
        profilePictureBytes === undefined ? undefined : new Uint8Array(profilePictureBytes),
      )
      .catch((error) => {
        toast.addSimpleFailure($i18n.t('groups.error--creation-failed', 'Failed to create group'));
        log.error('Failed to create group with error: ', error);
        services.router.goToWelcome();
      });

    if (groupUid === undefined) {
      toast.addSimpleFailure($i18n.t('groups.error--creation-failed', 'Failed to create group'));
      return;
    }
    services.router.goToConversation(
      {receiverLookup: {type: ReceiverType.GROUP, uid: groupUid}},
      {nav: ROUTE_DEFINITIONS.nav.conversationList.withoutParams()},
    );
  }
</script>

{#if currentStep === 'step-one'}
  <StepOne
    {contacts}
    {onclickcancel}
    onformcancel={onclickformcancel}
    onformcontinue={handleStepOneNextClicked}
    onselectitem={handleSelectReceiver}
    {selectedContacts}
    {services}
  />
{:else if currentStep === 'step-two'}
  <StepTwo
    bind:groupName
    {contacts}
    onclickback={handleClickBackFromStepTwo}
    {onclickcancel}
    oncontinue={handleStepTwoNextClicked}
    selectedMembers={selectedContacts}
    {services}
  />
{:else}
  {svelteUnreachable(currentStep)}
{/if}

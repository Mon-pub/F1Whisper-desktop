<script lang="ts">
  import {globals} from '~/app/globals';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import {isReceiverMatchingSearchTerm} from '~/app/ui/components/partials/address-book/helpers';
  import StepOne from '~/app/ui/components/partials/group-add-form/internal/step-one/StepOne.svelte';
  import StepTwo from '~/app/ui/components/partials/group-add-form/internal/step-two/StepTwo.svelte';
  import type {GroupAddFormProps} from '~/app/ui/components/partials/group-add-form/props';
  import type {ReceiverPreviewListItem} from '~/app/ui/components/partials/receiver-preview-list/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {MAX_GROUP_NAME_BYTES} from '~/app/ui/utils/constants';
  import type {DbContactUid} from '~/common/db';
  import {ReceiverType} from '~/common/enum';
  import {assert, unreachable} from '~/common/utils/assert';
  import {UTF8} from '~/common/utils/codec';
  import type {AnyReceiverDataOrSelf} from '~/common/viewmodel/utils/receiver';

  const log = globals.unwrap().uiLogging.logger('ui.component.group-add-form');

  const {actions, contacts, onclickback, onclickcancel, services}: GroupAddFormProps = $props();

  const selectedContacts = $state<Set<DbContactUid>>(new Set());

  let currentStep = $state<'step-one' | 'step-two'>('step-one');
  let searchTerm: string | undefined = $state(undefined);
  let groupName: string = $state('');

  function getSelectableContacts(
    currentItems: typeof contacts,
    currentSearchTerm: string | undefined,
  ): ReceiverPreviewListItem<unknown>[] {
    return currentItems
      .filter((item) => {
        // Only retain contacts that were added manually by the user.
        if (item.receiver.type !== 'contact') {
          return false;
        }

        // For groups, we disallow adding invalid contacts.
        if (item.receiver.isInvalid) {
          return false;
        }

        // Filter items by search term.
        if (currentSearchTerm !== undefined && currentSearchTerm !== '') {
          return isReceiverMatchingSearchTerm(item.receiver, currentSearchTerm);
        }

        return true;
      })
      .map((item) => {
        assert(item.receiver.type === 'contact');

        return {
          ...item,
          interaction: {
            mode: 'select',
            isSelected: selectedContacts.has(item.receiver.lookup.uid),
            onselect: (selected) => handleSelectReceiver(selected, item.receiver),
          },
        };
      });
  }

  function handleSelectReceiver(selected: boolean, receiver: AnyReceiverDataOrSelf): void {
    if (
      receiver.type === 'self' ||
      receiver.type === 'group' ||
      receiver.type === 'distribution-list'
    ) {
      log.debug('GroupAddForm receiver list should only contain contacts');
      return;
    }

    if (!selected) {
      selectedContacts.delete(receiver.lookup.uid);
    } else {
      selectedContacts.add(receiver.lookup.uid);
    }

    selectableContacts = getSelectableContacts(contacts, searchTerm);
  }

  function handleStepOneNextClicked(): void {
    currentStep = 'step-two';
    searchTerm = undefined;
  }

  function handleClickBackFromStepTwo(): void {
    currentStep = 'step-one';
  }

  async function handleStepTwoNextClicked(groupName_: string): Promise<void> {
    if (UTF8.encode(groupName_).byteLength > MAX_GROUP_NAME_BYTES) {
      return;
    }
    const groupUid = await actions
      .createGroup?.({name: groupName_}, selectedContacts)
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

  let selectableContacts = $derived(getSelectableContacts(contacts, searchTerm));
</script>

{#if currentStep === 'step-one'}
  <StepOne
    bind:searchTerm
    contacts={selectableContacts}
    {onclickback}
    {onclickcancel}
    oncontinue={handleStepOneNextClicked}
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
  {unreachable(currentStep)}
{/if}

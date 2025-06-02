<!--
  @component Renders a modal with details about a message.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import CopyExistingPoll from '~/app/ui/components/partials/modals/create-poll-modal/internal/copy-existing-poll/CopyExistingPoll.svelte';
  import CreatePollForm from '~/app/ui/components/partials/modals/create-poll-modal/internal/create-poll-form/CreatePollForm.svelte';
  import type {CreatePollFormProps} from '~/app/ui/components/partials/modals/create-poll-modal/internal/create-poll-form/props';
  import type {CreatePollModalProps} from '~/app/ui/components/partials/modals/create-poll-modal/props';
  import {pollListViewModelStoreToReceiverPreviewListItemsStore} from '~/app/ui/components/partials/modals/create-poll-modal/transformers';
  import type {RemotePollListViewModelBundle} from '~/app/ui/components/partials/modals/create-poll-modal/types';
  import {i18n} from '~/app/ui/i18n';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {PollAnnounceType, PollAnswerType} from '~/common/enum';
  import {ensureError, unreachable} from '~/common/utils/assert';
  import {ReadableStore, type IQueryableStore} from '~/common/utils/store';
  import type {SendPollBasedMessageInformation} from '~/common/viewmodel/conversation/main/controller/types';
  import type {PollItemData} from '~/common/viewmodel/polls/list/store/types';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.create-poll-modal');

  const {onclose, onsend, services}: CreatePollModalProps = $props();

  let createPollFormComponent = $state<SvelteNullableBinding<CreatePollForm>>(null);

  let choices = $state<CreatePollFormProps['choices']>([
    {description: '', id: 1},
    {description: '', id: 2},
  ]);

  let pollTitle = $state<CreatePollFormProps['pollTitle']>('');
  let options = $state<CreatePollFormProps['options']>({
    allowMultipleAnswers: true,
    showIntermediateResults: true,
  });

  let isFormValid = $state<boolean>(false);

  let mode = $state<'copy-poll' | 'create-poll'>('create-poll');

  // ViewModelBundle containing all the group details.
  let viewModelStore = $state<IQueryableStore<RemotePollListViewModelBundle | undefined>>(
    new ReadableStore(undefined),
  );

  services.backend.viewModel
    .pollList()
    .then((viewModelBundle) => {
      viewModelStore = viewModelBundle.viewModelStore;
    })
    .catch((error: unknown) => {
      log.error(`Failed to load poll list: ${ensureError(error)}`);
    });

  function handleSend(poll: SendPollBasedMessageInformation): void {
    onsend(poll);
    onclose?.(undefined);
  }

  function handleClickCopyPoll(): void {
    mode = 'copy-poll';
  }

  function handleClickBack(): void {
    mode = 'create-poll';
  }

  function handleCopyExistingPoll(item: PollItemData): void {
    mode = 'create-poll';
    pollTitle = item.description;
    choices = item.choices
      .map((choice) => ({
        description: choice.description,
        id: choice.sortKey,
      }))
      .sort((a, b) => a.id - b.id);
    options = {
      allowMultipleAnswers: item.answerType === PollAnswerType.MULTIPLE_CHOICE,
      showIntermediateResults: item.announceType === PollAnnounceType.ON_EVERY_VOTE,
    };
  }

  const copyExistingPollItemsStore = $derived(
    pollListViewModelStoreToReceiverPreviewListItemsStore(viewModelStore),
  );
</script>

<Modal
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: onclose,
      },
    ],
    buttons:
      mode === 'create-poll'
        ? [
            {
              isFocused: true,
              label: $i18n.t('dialog--common.action--cancel', 'Cancel'),
              onclick: onclose,
              type: 'naked',
            },
            {
              label: $i18n.t('dialog--common.action--send', 'Send'),
              onclick: 'submit',
              type: 'filled',
              disabled: !isFormValid,
            },
          ]
        : [
            {
              isFocused: true,
              label: $i18n.t('dialog--common.action--back', 'Back'),
              onclick: handleClickBack,
              type: 'naked',
            },
          ],
    title:
      mode === 'create-poll'
        ? $i18n.t('dialog--create-poll-message.label--create-title', 'Create Poll')
        : $i18n.t('dialog--create-poll-message.label--copy-title', 'Copy Poll'),
    minWidth: 340,
    maxWidth: 460,
  }}
  {onclose}
  onsubmit={() => createPollFormComponent?.submit()}
  options={{
    allowClosingWithEsc: false,
    allowSubmittingWithEnter: true,
  }}
>
  <div class="content">
    {#if mode === 'create-poll'}
      <CreatePollForm
        bind:this={createPollFormComponent}
        bind:choices
        bind:isFormValid
        bind:options
        onclickcopypoll={handleClickCopyPoll}
        onsend={handleSend}
        {pollTitle}
      />
    {:else if mode === 'copy-poll'}
      <CopyExistingPoll
        onclickexistingpoll={handleCopyExistingPoll}
        pollItemList={$copyExistingPollItemsStore ?? []}
      />
    {:else}
      {unreachable(mode)}
    {/if}
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    overflow: scroll;
    height: rem(480px);
  }
</style>

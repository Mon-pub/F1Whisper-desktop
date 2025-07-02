<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import {getParticipants, sortChoicesByVotes} from '~/app/ui/components/partials/poll/helpers';
  import ViewVotesItem from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/internal/poll-votes-list-item/PollVotesListItem.svelte';
  import type {PollVotesListModalProps} from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {PollDisplayMode} from '~/common/enum';

  const {
    displayMode,
    choices,
    description,
    onclose,
    receiver,
    selfReceiverData,
    services,
  }: PollVotesListModalProps = $props();
</script>

<Modal
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
    title: $i18n.t('polls.label--results-title', 'Poll Results'),
    minWidth: 320,
    maxWidth: 480,
  }}
  {onclose}
>
  <div class="description">
    <Text text={description} family="primary" />
  </div>
  {#each sortChoicesByVotes(displayMode, choices) as choice (choice.choiceId)}
    {@const selectedVotes = choice.votes.filter((v) => v.selected)}

    <ViewVotesItem
      description={choice.description}
      participants={getParticipants(
        receiver,
        selfReceiverData,
        selectedVotes.map((v) => v.senderIdentity),
      )}
      {services}
      totalAmountVotes={displayMode === PollDisplayMode.SUMMARY
        ? (choice.totalAmountVotes ?? 0)
        : selectedVotes.length}
    />
  {/each}
</Modal>

<style lang="scss">
  @use 'component' as *;

  .description {
    margin: 0 rem(16px);
    padding: rem(16px);
    background-color: var(--t-nav-background-color);
    border-radius: rem(4px);
  }
</style>

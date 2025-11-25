<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import {
    getParticipants,
    sortChoicesByVotesAndMapToSelected,
  } from '~/app/ui/components/partials/poll/helpers';
  import PollVotesListItem from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/internal/poll-votes-list-item/PollVotesListItem.svelte';
  import type {PollVotesListModalProps} from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/props';
  import {i18n} from '~/app/ui/i18n';

  const {
    choices,
    description,
    displayMode,
    onclose,
    receiver,
    selfReceiverData,
    services,
  }: PollVotesListModalProps = $props();

  const sortedChoicesByVotes = $derived(sortChoicesByVotesAndMapToSelected(displayMode, choices));
  const winnerVotes = $derived(sortedChoicesByVotes[0]?.numVotes ?? 0);
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
  {#each sortedChoicesByVotes as choice (choice.choiceId)}
    <PollVotesListItem
      description={choice.description}
      {displayMode}
      participants={getParticipants(
        receiver,
        selfReceiverData,
        choice.selectedVotes.map((vote) => vote.senderIdentity),
      )}
      isWinner={choice.numVotes > 0 && choice.numVotes >= winnerVotes}
      {services}
      totalAmountVotes={choice.numVotes}
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

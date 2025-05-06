<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import {getParticipants, sortChoicesByVotes} from '~/app/ui/components/partials/poll/helpers';
  import ViewVotesItem from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/internal/poll-votes-list-item/PollVotesListItem.svelte';
  import type {PollVotesListModalProps} from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/props';

  type $$Props = PollVotesListModalProps;

  export let description: NonNullable<$$Props['description']>;
  export let choices: NonNullable<$$Props['choices']>;
  export let receiver: NonNullable<$$Props['receiver']>;
  export let selfReceiverData: NonNullable<$$Props['selfReceiverData']>;
  export let profilePictureService: $$Props['profilePictureService'];
</script>

<Modal
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onClick: 'close',
      },
    ],
    title: 'Voting results',
    minWidth: 320,
    maxWidth: 480,
  }}
  on:close
>
  <div class="description">
    <Text text={description} family="primary" />
  </div>
  {#each sortChoicesByVotes(choices) as choice (choice.choiceId)}
    {@const selectedVotes = choice.votes.filter((v) => v.selected)}
    <ViewVotesItem
      description={choice.description}
      totalAmountVotes={choice.totalAmountVotes ?? selectedVotes.length}
      {profilePictureService}
      participants={getParticipants(
        receiver,
        selfReceiverData,
        selectedVotes.map((v) => v.senderIdentity),
      )}
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

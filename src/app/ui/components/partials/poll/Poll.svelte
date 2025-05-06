<!--
  @component
  Renders a poll.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import {getParticipants} from '~/app/ui/components/partials/poll/helpers';
  import Choice from '~/app/ui/components/partials/poll/internal/choice/Choice.svelte';
  import PollVotesListModal from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/PollVotesListModal.svelte';
  import type {PollProps, ModalState} from '~/app/ui/components/partials/poll/props';
  import {i18n} from '~/app/ui/i18n';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import {PollAnswerType, PollState, PollMessageType} from '~/common/enum';
  import {extractErrorMessage} from '~/common/error';
  import type {i53} from '~/common/types';
  import {ensureError} from '~/common/utils/assert';

  const log = globals.unwrap().uiLogging.logger('ui.component.poll');

  type $$Props = PollProps;
  export let pollData: NonNullable<$$Props['pollData']>;
  export let receiver: NonNullable<$$Props['receiver']>;
  export let profilePictureService: $$Props['profilePictureService'];

  let modalState: ModalState = {type: 'none'};

  $: votesMax = Math.max(...pollData.choices.map((c) => c.votes.filter((v) => v.selected).length));

  function onselect(choiceId: i53, checked: boolean): void {
    if (pollData.pollState === PollState.CLOSED) {
      return;
    }

    let choices = pollData.choices.flatMap((choice) =>
      choice.votes
        .filter((vote) => vote.senderIdentity === pollData.selfReceiverData.identity)
        .map((vote) => {
          let selected =
            pollData.answerType === PollAnswerType.MULTIPLE_CHOICE ? vote.selected : false;

          if (choice.choiceId === choiceId) {
            selected = checked;
          }

          return {
            choiceId: choice.choiceId,
            selected,
          };
        }),
    );

    // If voting for the first time, just set selected choice to true and all other to false.
    if (choices.length === 0) {
      choices = pollData.choices.map((choice) => ({
        choiceId: choice.choiceId,
        selected: choice.choiceId === choiceId ? checked : false,
      }));
    }

    pollData
      .pollVote({
        pollId: pollData.pollId,
        creatorIdentity: pollData.pollCreatorIdentity,
        choices,
      })
      .catch((error: unknown) => {
        log.error(`Error voting on poll: ${extractErrorMessage(ensureError(error), 'short')}`);
      });
  }
</script>

<div class="container">
  {#if pollData.pollMessageType === PollMessageType.POLL_CREATED}
    <div class="description">
      <Text family="primary" text={pollData.description} />
    </div>
    <div class="answer-type">
      <Text
        size="body-small"
        text={pollData.answerType === PollAnswerType.SINGLE_CHOICE
          ? $i18n.t('polls.label--answer-type-single', 'Select one answer')
          : $i18n.t('polls.label--answer-type-multiple', 'Select multiple answers')}
      />
      <br />
    </div>

    {#each pollData.choices as choice (choice.choiceId)}
      {@const selectedVotes = choice.votes.filter((v) => v.selected)}
      <Choice
        pollId={pollData.pollId}
        choiceId={choice.choiceId}
        description={choice.description}
        selected={selectedVotes
          .map((v) => v.senderIdentity)
          .includes(pollData.selfReceiverData.identity)}
        disabled={pollData.pollState === PollState.CLOSED}
        {onselect}
        votesCurrent={selectedVotes.length}
        {votesMax}
        {profilePictureService}
        receivers={getParticipants(
          receiver,
          pollData.selfReceiverData,
          selectedVotes.map((v) => v.senderIdentity),
        )}
        announceType={pollData.announceType}
      />
    {/each}
  {:else}
    <Text text={$i18n.t('polls.prose--poll-closed', 'Check the votes for')} />
    <Text text={` "${pollData.description}".`} family="primary" />
    <div class="vote-button-container">
      <Button
        class="vote-button"
        flavor="filled"
        disabled={pollData.pollState !== PollState.CLOSED}
        on:click={() => {
          modalState = {
            type: 'view-votes',
          };
        }}
      >
        {$i18n.t('polls.label--view-votes', 'View Votes')}
      </Button>
    </div>
  {/if}
</div>

{#if modalState.type === 'view-votes'}
  <PollVotesListModal
    description={pollData.description}
    choices={pollData.choices}
    selfReceiverData={pollData.selfReceiverData}
    {receiver}
    {profilePictureService}
    on:close={() => {
      modalState = {
        type: 'none',
      };
    }}
  />
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    min-width: rem(320px); // TODO(DESK-181): ask this

    .description {
      margin: rem(8px) 0;
    }

    .answer-type {
      margin-bottom: rem(16px);
    }

    .vote-button-container {
      margin: rem(40px) 0 rem(20px) 0;
    }
  }

  :global(.vote-button) {
    width: 100%;
    height: rem(30px);
  }
</style>

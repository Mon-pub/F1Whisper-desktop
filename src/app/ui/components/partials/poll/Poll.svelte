<!--
  @component Renders a poll.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import {
    getParticipants,
    receiverAllowsPollInteraction,
  } from '~/app/ui/components/partials/poll/helpers';
  import Choice from '~/app/ui/components/partials/poll/internal/choice/Choice.svelte';
  import ClosePollModal from '~/app/ui/components/partials/poll/internal/close-poll-modal/ClosePollModal.svelte';
  import PollVotesListModal from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/PollVotesListModal.svelte';
  import type {PollProps, ModalState} from '~/app/ui/components/partials/poll/props';
  import {i18n} from '~/app/ui/i18n';
  import type {I18nType} from '~/app/ui/i18n-types';
  import {toast} from '~/app/ui/snackbar';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import {PollAnswerType, PollState, PollMessageType, PollDisplayMode} from '~/common/enum';
  import {extractErrorMessage} from '~/common/error';
  import type {i53, u53} from '~/common/types';
  import {ensureError} from '~/common/utils/assert';

  const log = globals.unwrap().uiLogging.logger('ui.component.poll');

  const {pollData, receiver, services}: PollProps = $props();

  let modalState = $state<ModalState>({type: 'none'});

  const votesMax = $derived<u53>(
    pollData.displayMode === PollDisplayMode.SUMMARY && pollData.pollState === PollState.CLOSED
      ? Math.max(...pollData.choices.map((c) => c.totalAmountVotes ?? 0))
      : Math.max(...pollData.choices.map((c) => c.votes.filter((v) => v.selected).length)),
  );

  function getSubtitle(currentI18n: I18nType, currentPollData: typeof pollData): string {
    if (currentPollData.pollState === PollState.CLOSED) {
      return currentI18n.t(
        'polls.label--poll-state-closed',
        'The poll has ended and voting is no longer available',
      );
    }
    return currentPollData.answerType === PollAnswerType.SINGLE_CHOICE
      ? currentI18n.t('polls.label--answer-type-single', 'Select one option')
      : currentI18n.t('polls.label--answer-type-multiple', 'Select one or more options');
  }

  function handleSelect(choiceId: i53, checked: boolean): void {
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

  function handleClosePoll(): void {
    receiver
      .closePoll({pollCreatorIdentity: pollData.pollCreatorIdentity, pollId: pollData.pollId})
      .catch((error: unknown) => {
        log.error(`Error closing on poll: ${extractErrorMessage(ensureError(error), 'short')}`);
        toast.addSimpleFailure($i18n.t('polls.error--close-polls', 'Closing the poll failed'));
      });
  }
  function handleCloseModal(): void {
    modalState = {type: 'none'};
  }

  const interactionButtonsDisabled = $derived(!receiverAllowsPollInteraction(receiver));
</script>

<div class="container">
  {#if pollData.pollMessageType === PollMessageType.POLL_CREATED}
    {@const showParticipants =
      pollData.pollCreatorIdentity === pollData.selfReceiverData.identity &&
      pollData.pollState !== PollState.CLOSED}
    <div class="description">
      <Text family="primary" text={pollData.description} />
    </div>
    <div class="meta-data">
      <Text size="body-small" text={getSubtitle($i18n, pollData)} wrap />
      {#if showParticipants}
        <Text
          size="body-small"
          text={$i18n.t('polls.label--number-of-participants', `{voted}/{total} participants`, {
            voted: pollData.numberOfParticipants ?? 0,
            total: receiver.type === 'group' ? receiver.members.length + 1 : 2,
          })}
        />
      {/if}
    </div>

    {#each pollData.choices as choice (choice.choiceId)}
      {@const selectedVotes = choice.votes.filter((v) => v.selected)}

      <Choice
        announceType={pollData.announceType}
        choiceId={choice.choiceId}
        description={choice.description}
        disabled={pollData.pollState === PollState.CLOSED || interactionButtonsDisabled}
        onselect={handleSelect}
        pollId={pollData.pollId}
        receivers={getParticipants(
          receiver,
          pollData.selfReceiverData,
          selectedVotes.map((v) => v.senderIdentity),
        )}
        selected={selectedVotes
          .map((v) => v.senderIdentity)
          .includes(pollData.selfReceiverData.identity)}
        {services}
        votesCurrent={pollData.displayMode === PollDisplayMode.SUMMARY &&
        pollData.pollState === PollState.CLOSED
          ? (choice.totalAmountVotes ?? 0)
          : selectedVotes.length}
        {votesMax}
      />
    {/each}
    {#if pollData.pollCreatorIdentity === pollData.selfReceiverData.identity && pollData.pollState !== PollState.CLOSED}
      <div class="close-button-container">
        <Button
          class="close-button"
          flavor="filled"
          onclick={() => {
            modalState = {type: 'close-poll'};
          }}
          disabled={interactionButtonsDisabled}
        >
          {$i18n.t('polls.label--close-poll', 'Close Poll')}
        </Button>
      </div>
    {/if}
  {:else}
    <Text
      text={$i18n.t('polls.prose--poll-closed', 'Check the votes for “{description}”', {
        description: pollData.description,
      })}
    />
    <div class="vote-button-container">
      <Button
        class="vote-button"
        disabled={pollData.pollState !== PollState.CLOSED}
        flavor="filled"
        onclick={() => {
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

{#if modalState.type === 'none'}
  <!--Nothing to display-->
{:else if modalState.type === 'view-votes'}
  <PollVotesListModal
    displayMode={pollData.displayMode}
    choices={pollData.choices}
    description={pollData.description}
    onclose={handleCloseModal}
    {receiver}
    selfReceiverData={pollData.selfReceiverData}
    {services}
  />
{:else if modalState.type === 'close-poll'}
  <ClosePollModal onclose={handleCloseModal} onclosepoll={handleClosePoll} />
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    width: fit-content;
    min-width: 100%;

    .description {
      margin: rem(8px) 0;
    }

    .meta-data {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: rem(12px);
    }

    .vote-button-container,
    .close-button-container {
      margin: rem(40px) 0 rem(20px) 0;
    }
  }

  :global(.vote-button, .close-button) {
    width: 100%;
    height: rem(30px);
  }
</style>

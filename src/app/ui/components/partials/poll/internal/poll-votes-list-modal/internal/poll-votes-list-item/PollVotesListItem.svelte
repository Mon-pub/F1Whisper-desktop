<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {PollVotesListItemProps} from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/internal/poll-votes-list-item/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {i18n} from '~/app/ui/i18n';

  const {description, participants, services, totalAmountVotes}: PollVotesListItemProps = $props();
</script>

<div class="container">
  <div class="header">
    <Text text={description} family="primary" />
    <Text
      text={$i18n.t('polls.label--choice-votes', '{totalAmountVotes} vote(s)', {
        totalAmountVotes,
      })}
      family="primary"
      wrap={false}
    />
  </div>

  {#each participants as participant, index (participant.name)}
    <div class={index < participants.length - 1 ? 'participant' : 'participant participant-last'}>
      <ProfilePicture
        options={{
          hideDefaultCharms: true,
          isClickable: false,
        }}
        receiver={participant}
        {services}
        size="xs"
      />
      <div>{participant.name}</div>
    </div>
  {/each}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    margin: rem(16px);
    padding: rem(16px);
    background-color: var(--t-nav-background-color);
    border-radius: rem(4px);

    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      column-gap: rem(32px);
    }

    .participant {
      display: flex;
      align-items: center;
      column-gap: rem(8px);
      padding: rem(16px) 0;
      border-bottom: rem(1px) solid var(--ic-divider-background-color);
    }

    .participant-last {
      border-bottom: 0;
    }
  }
</style>

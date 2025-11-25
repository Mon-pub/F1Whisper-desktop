<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {PollVotesListItemProps} from '~/app/ui/components/partials/poll/internal/poll-votes-list-modal/internal/poll-votes-list-item/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {PollDisplayMode} from '~/common/enum';

  const {
    description,
    displayMode,
    isWinner,
    participants,
    services,
    totalAmountVotes,
  }: PollVotesListItemProps = $props();

  let expanded = $state<boolean>(isWinner && displayMode !== PollDisplayMode.SUMMARY);

  function onClickToggleExpand(): void {
    expanded = !expanded;
  }
</script>

<div class="container">
  <div class="header">
    <Text text={description} family="primary" />
    <div class="right">
      {#if isWinner}
        <MdIcon theme="Filled">star</MdIcon>
      {/if}
      <button
        class="expand"
        onclick={onClickToggleExpand}
        disabled={participants.length === 0 || totalAmountVotes === 0}
        ><MdIcon theme="Filled">{expanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}</MdIcon
        ></button
      >
    </div>
  </div>
  <div class="votes">
    <Text
      text={$i18n.t('polls.label--choice-votes', '{n, plural, =1 {1 vote} other {# votes}}', {
        n: totalAmountVotes,
      })}
      family="secondary"
      wrap={false}
    />
  </div>
  {#if expanded}
    <div class="list-container">
      {#each participants as participant, index (index)}
        <div class="participant">
          <ProfilePicture
            options={{
              hideDefaultCharms: true,
              isClickable: false,
            }}
            receiver={participant}
            {services}
            size="xs"
          />
          <Text text={participant.name}></Text>
        </div>
      {/each}
    </div>
  {/if}
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

      .right {
        display: flex;
        align-items: center;
        gap: rem(8px);

        .expand {
          font-size: rem(22px);
          @include clicktarget-button-circle;
        }
      }
    }

    .list-container {
      .participant {
        display: flex;
        align-items: center;
        column-gap: rem(8px);
        padding: rem(16px) 0;
        border-bottom: rem(1px) solid var(--ic-divider-background-color);
      }

      .participant:last-child {
        border-bottom: 0;
        padding-bottom: 0;
      }
    }
  }
</style>

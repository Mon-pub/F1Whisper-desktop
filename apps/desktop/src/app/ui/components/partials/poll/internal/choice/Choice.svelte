<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import RadialExclusionMaskProvider from '~/app/ui/components/hocs/radial-exclusion-mask-provider/RadialExclusionMaskProvider.svelte';
  import Checkbox from '~/app/ui/components/partials/poll/internal/choice/internal/checkbox/Checkbox.svelte';
  import ProgressBar from '~/app/ui/components/partials/poll/internal/choice/internal/progress-bar/ProgressBar.svelte';
  import type {ChoiceProps} from '~/app/ui/components/partials/poll/internal/choice/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import type {ProfilePictureReceiverData} from '~/app/ui/components/partials/profile-picture/props';
  import Tooltip from '~/app/ui/generic/popover/Tooltip.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {PollAnnounceType} from '~/common/enum';

  const {
    announceType,
    choiceId,
    description,
    disabled,
    pollId,
    receivers,
    selected,
    services,
    votesCurrent,
    votesMax,
    onselect,
    checklist = false,
  }: ChoiceProps = $props();

  let tooltipComponent = $state<SvelteNullableBinding<Tooltip>>(null);

  const DEFAULT_CUTOUT = {
    diameter: 34,
    position: {
      x: -60,
      y: 50,
    },
  };

  const receiversSample = $derived<ProfilePictureReceiverData[]>(
    receivers.length > 4 ? receivers.slice(0, 4) : receivers,
  );

  function handleCheck(checked: boolean): void {
    onselect(choiceId, checked);
  }

  const anchorName = $derived(`--poll-${pollId}-${choiceId}` as const);
</script>

<div class="container" class:checklist>
  <Checkbox
    checked={selected}
    {disabled}
    id={`${pollId.toString()}_${String(choiceId)}`}
    oncheck={handleCheck}
    text={description}
  />
  {#if announceType === PollAnnounceType.ON_EVERY_VOTE}
    <div
      class="receivers"
      onmouseenter={() => {
        tooltipComponent?.open();
      }}
      onmouseleave={() => tooltipComponent?.close()}
      role="tooltip"
      style:anchor-name={anchorName}
    >
      <div class={`profile-pictures ${disabled ? 'disabled' : ''}`}>
        {#each receiversSample as receiver, index (index)}
          {#if index === 0}
            <ProfilePicture
              options={{
                hideDefaultCharms: true,
                isClickable: false,
              }}
              {receiver}
              {services}
              size="xs"
            />
          {:else}
            <RadialExclusionMaskProvider cutouts={[DEFAULT_CUTOUT]}>
              <ProfilePicture
                options={{
                  hideDefaultCharms: true,
                  isClickable: false,
                }}
                {receiver}
                {services}
                size="xs"
              />
            </RadialExclusionMaskProvider>
          {/if}
        {/each}
      </div>
      <div>
        {votesCurrent}
      </div>
    </div>
  {/if}
</div>
{#if !checklist}
  <ProgressBar value={votesMax > 0 ? (votesCurrent * 100) / votesMax : 0} {disabled} />
{/if}

{#if votesCurrent > 0 && announceType === PollAnnounceType.ON_EVERY_VOTE}
  <Tooltip bind:this={tooltipComponent} {anchorName}>
    <span class="content">
      <Text
        alignment="center"
        text={receivers
          .map((receiver) => receiver.name)
          .sort((a, b) => a.localeCompare(b))
          .join(', ')}
      />
    </span>
  </Tooltip>
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    margin-top: rem(4px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    column-gap: rem(24px);

    // Checklist rows have no progress bar beneath them, so add a touch of vertical breathing room
    // to keep the same rhythm as poll rows.
    &.checklist {
      margin-top: rem(2px);
      padding: rem(4px) 0;
    }
  }

  .receivers {
    display: flex;
    align-items: center;
    column-gap: rem(8px);

    .profile-pictures {
      display: flex;
      align-items: center;
      justify-content: right;

      & :global(> .container:not(:last-child)) {
        margin-right: rem(-2px);
      }

      &.disabled {
        filter: saturate(0);
      }
    }
  }

  .content {
    padding: 0;
    margin: rem(10px);
    max-width: rem(280px);
    text-align: center;
  }
</style>

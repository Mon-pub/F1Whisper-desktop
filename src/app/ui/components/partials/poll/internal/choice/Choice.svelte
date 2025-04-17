<script lang="ts">
  import RadialExclusionMaskProvider from '~/app/ui/components/hocs/radial-exclusion-mask-provider/RadialExclusionMaskProvider.svelte';
  import Checkbox from '~/app/ui/components/partials/poll/internal/choice/internal/checkbox/Checkbox.svelte';
  import ProgressBar from '~/app/ui/components/partials/poll/internal/choice/internal/progress-bar/ProgressBar.svelte';
  import type {ChoiceProps} from '~/app/ui/components/partials/poll/internal/choice/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import type {ProfilePictureReceiverData} from '~/app/ui/components/partials/profile-picture/props';
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
  }: ChoiceProps = $props();

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
</script>

<div class="container">
  <Checkbox
    checked={selected}
    {disabled}
    id={`${pollId.toString()}_${String(choiceId)}`}
    oncheck={handleCheck}
    text={description}
  />
  {#if announceType === PollAnnounceType.ON_EVERY_VOTE}
    <div class="receivers">
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
      <div>{votesCurrent}</div>
    </div>
  {/if}
</div>
<ProgressBar value={votesMax > 0 ? (votesCurrent * 100) / votesMax : 0} {disabled} />

<style lang="scss">
  @use 'component' as *;

  .container {
    margin-top: rem(4px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    column-gap: rem(24px);
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
</style>

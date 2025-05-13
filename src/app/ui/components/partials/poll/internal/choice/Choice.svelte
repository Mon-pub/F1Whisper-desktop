<script lang="ts">
  import RadialExclusionMaskProvider from '~/app/ui/components/hocs/radial-exclusion-mask-provider/RadialExclusionMaskProvider.svelte';
  import Checkbox from '~/app/ui/components/partials/poll/internal/choice/internal/checkbox/Checkbox.svelte';
  import ProgressBar from '~/app/ui/components/partials/poll/internal/choice/internal/progress-bar/ProgressBar.svelte';
  import type {ChoiceProps} from '~/app/ui/components/partials/poll/internal/choice/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {PollAnnounceType} from '~/common/enum';

  type $$Props = ChoiceProps;

  export let pollId: NonNullable<$$Props['pollId']>;
  export let choiceId: NonNullable<$$Props['choiceId']>;
  export let description: NonNullable<$$Props['description']>;
  export let selected: NonNullable<$$Props['selected']>;
  export let disabled: NonNullable<$$Props['disabled']>;
  export let votesCurrent: NonNullable<$$Props['votesCurrent']>;
  export let votesMax: NonNullable<$$Props['votesMax']>;
  export let receivers: NonNullable<$$Props['receivers']>;
  export let profilePictureService: $$Props['profilePictureService'];
  export let announceType: $$Props['announceType'];
  export let onselect: $$Props['onselect'];

  const DEFAULT_CUTOUT = {
    diameter: 34,
    position: {
      x: -60,
      y: 50,
    },
  };

  $: receiversSample = receivers.length > 4 ? receivers.slice(0, 4) : receivers;

  function oncheck(checked: boolean): void {
    onselect(choiceId, checked);
  }
</script>

<div class="container">
  <Checkbox
    id={`${pollId.toString()}_${String(choiceId)}`}
    text={description}
    checked={selected}
    {disabled}
    {oncheck}
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
              services={{profilePicture: profilePictureService}}
              size="xsm"
            />
          {:else}
            <RadialExclusionMaskProvider cutouts={[DEFAULT_CUTOUT]}>
              <ProfilePicture
                options={{
                  hideDefaultCharms: true,
                  isClickable: false,
                }}
                {receiver}
                services={{profilePicture: profilePictureService}}
                size="xsm"
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

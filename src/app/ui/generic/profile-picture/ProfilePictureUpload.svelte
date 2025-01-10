<script lang="ts">
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
</script>

<button class="wip" disabled={true}>
  <span>
    <!-- TODO(DESK-390): Implement profile picture picker. -->
    <MdIcon theme="Outlined">add_a_photo</MdIcon>
  </span>
</button>

<style lang="scss">
  @use 'component' as *;

  button {
    @include clicktarget-button-circle;

    & {
      width: rem(120px);
      height: rem(120px);
      border-radius: 50%;
      background-color: var(--cc-profile-picture-upload-background-color);
      display: grid;
      place-items: center;
      cursor: pointer;
    }

    span {
      display: grid;
      place-items: center;
      color: var(--t-color-primary);
      --c-icon-font-size: #{rem(24px)};
      user-select: none;
    }
  }
</style>

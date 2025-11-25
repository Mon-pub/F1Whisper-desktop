<!--
  @component Renders the name of the sender of a message.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {SenderProps} from '~/app/ui/components/molecules/message/internal/sender/props';

  const {color, messageHasThumbnail, name}: SenderProps = $props();
</script>

<span
  class="sender"
  style:--c-t-text-color={`var(--c-profile-picture-initials-${color})`}
  data-is-wrapping-no-thumbnail={messageHasThumbnail ? false : name.length > 32}
>
  <Text selectable={true} text={name} wrap={messageHasThumbnail ? true : name.length > 32} />
</span>

<style lang="scss">
  @use 'component' as *;

  $-vars: (text-color);
  $-temp-vars: format-each($-vars, $prefix: --c-t-);

  .sender {
    @extend %font-small-700;
    color: var($-temp-vars, --c-t-text-color);

    // If sender name is wrapping, but the message has no thumbnail, we need to enforce a minimum
    // sender width so that the message doesn't collapse fully.
    &[data-is-wrapping-no-thumbnail='true'] {
      min-width: 32ch;
    }
  }
</style>

<script lang="ts">
  import type {EmojiProps} from '~/app/ui/components/atoms/emoji/props';

  type $$Props = EmojiProps;

  export let unicode: $$Props['unicode'];
</script>

<span class="emoji">{unicode}</span>

<style lang="scss">
  @use 'component' as *;

  .emoji {
    font-family: 'Apple Color Emoji', Twemoji, sans-serif;
    font-variant-emoji: emoji;
  }
</style>

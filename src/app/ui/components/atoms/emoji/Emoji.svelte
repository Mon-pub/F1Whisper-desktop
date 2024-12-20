<script lang="ts">
  import type {EmojiProps} from '~/app/ui/components/atoms/emoji/props';

  type $$Props = EmojiProps;

  export let unicode: $$Props['unicode'];
</script>

<span class="emoji">{unicode}</span>

<style lang="scss">
  @use 'component' as *;

  .emoji {
    font-family: 'Emoji Picker Apple', 'Emoji Picker Twemoji', sans-serif;
    // See: https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-emoji#unicode.
    font-synthesis: none;
  }

  // Custom `@font-face`s for the emoji picker to allow overriding some values and equalize how both
  // fonts are displayed.

  @font-face {
    font-family: 'Emoji Picker Twemoji';
    src: map-get-req($config, emoji);
    size-adjust: 90%;
  }

  @font-face {
    font-family: 'Emoji Picker Apple';
    src: local('Apple Color Emoji');
    ascent-override: 110%;
  }
</style>

<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Bubble from '~/app/ui/components/molecules/message/internal/bubble/Bubble.svelte';
  import type {TypingIndicatorProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/typing-indicator/props';
  import {i18n} from '~/app/ui/i18n';
  import type {I18nType} from '~/app/ui/i18n-types';

  const {memberNames = []}: TypingIndicatorProps = $props();

  // Maximum number of names spelled out before collapsing the rest into a "+N" overflow.
  const MAX_NAMES = 2;

  /**
   * Build the "… is typing" label for a group conversation. Empty when there are no names (1:1
   * chats render only the animated dots).
   */
  function getTypingLabel(t: I18nType['t'], names: readonly string[]): string | undefined {
    if (names.length === 0) {
      return undefined;
    }
    if (names.length === 1) {
      return t('messaging.prose--group-typing-single', '{name} is typing…', {name: names[0] ?? ''});
    }
    if (names.length <= MAX_NAMES) {
      return t('messaging.prose--group-typing-multiple', '{names} are typing…', {
        names: names.join(', '),
      });
    }
    return t('messaging.prose--group-typing-overflow', '{names}, +{count} are typing…', {
      names: names.slice(0, MAX_NAMES).join(', '),
      count: (names.length - MAX_NAMES).toString(),
    });
  }

  const label = $derived(getTypingLabel($i18n.t, memberNames));
</script>

<Bubble direction="inbound">
  <div class="typing">
    {#if label !== undefined}
      <span class="label">
        <Text color="mono-low" size="body-small" text={label} wrap={false} />
      </span>
    {/if}
    <div class="dots">
      <div class="dot dot-one"></div>
      <div class="dot dot-two"></div>
      <div class="dot dot-three"></div>
    </div>
  </div>
</Bubble>

<style lang="scss">
  @use 'component' as *;

  .typing {
    display: flex;
    flex-direction: column;
    gap: rem(4px);
  }

  .label {
    display: flex;
    align-items: center;
  }

  .dots {
    display: flex;
    align-items: center;
    gap: rem(4px);
  }

  .dot {
    display: inline-block;
    width: rem(8px);
    height: rem(8px);
    border-radius: rem(4px);
    background-color: var(--t-text-e1-color);
  }

  .dot-one {
    animation: dot-flashing 0.5s infinite linear alternate;
    animation-delay: 0s;
  }

  .dot-two {
    animation: dot-flashing 0.5s infinite linear alternate;
    animation-delay: 0.25s;
  }

  .dot-three {
    animation: dot-flashing 0.5s infinite linear alternate;
    animation-delay: 0.5s;
  }

  @keyframes dot-flashing {
    0% {
      background-color: var(--t-text-e1-color);
    }
    50%,
    100% {
      opacity: 0.1;
    }
  }
</style>

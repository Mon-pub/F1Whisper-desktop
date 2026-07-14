<!--
  @component
  Dismissible compose-bar preview card (F1Whisper fork) shown above the input while composing a
  message that contains a previewable link. The preview is fetched on the sending device only; on
  send it travels end-to-end, so the recipient never contacts the URL. Styled to match the existing
  in-bubble link-preview card.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {LinkPreviewChipProps} from '~/app/ui/components/partials/conversation/internal/link-preview-chip/props';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {preview, ondismiss}: LinkPreviewChipProps = $props();

  function getDomain(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  // Render the preview image (re-encoded JPEG bytes, or a generated placeholder) from an object URL.
  let imageUrl = $state<string | undefined>(undefined);

  // Create the object URL when the preview image changes. CRITICAL: this effect must depend ONLY on
  // `preview.image` (its input) and must NEVER read `imageUrl` (its own output) — reading its own
  // output makes the effect re-run on every write, an `effect_update_depth_exceeded` infinite loop
  // (the original code read `imageUrl` inside the effect to revoke the old URL, which crashed the
  // renderer the moment a preview actually appeared). The previous URL is revoked in the teardown,
  // which Svelte runs before each re-run AND on unmount; we capture it in a local so the effect never
  // touches the `imageUrl` state.
  $effect(() => {
    const {bytes, mediaType} = preview.image;
    const url = URL.createObjectURL(new Blob([bytes], {type: mediaType}));
    imageUrl = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  });
</script>

<div class="link-preview-chip">
  {#if imageUrl !== undefined}
    <img class="image" src={imageUrl} alt="" />
  {/if}
  <div class="content">
    <span class="domain">
      <Text size="body-small" text={getDomain(preview.url)} wrap={false} />
    </span>
    {#if preview.title !== undefined && preview.title !== ''}
      <span class="title">
        <Text family="primary" size="body-small" text={preview.title} />
      </span>
    {/if}
    {#if preview.description !== undefined && preview.description !== ''}
      <span class="description">
        <Text color="mono-low" size="body-small" text={preview.description} />
      </span>
    {/if}
  </div>
  <span class="dismiss">
    <IconButton
      flavor="naked"
      onclick={ondismiss}
      title={$i18n.t('messaging.action--dismiss-link-preview', 'Remove preview')}
    >
      <MdIcon theme="Outlined">close</MdIcon>
    </IconButton>
  </span>
</div>

<style lang="scss">
  @use 'component' as *;

  .link-preview-chip {
    display: flex;
    align-items: center;
    gap: rem(10px);
    margin: rem(8px) rem(8px) 0;
    padding: rem(8px) rem(8px) rem(8px) rem(10px);
    border-radius: rem(10px);
    background-color: var(--mc-message-quote-background-color--hover);
    border-left: var(--mc-message-quote-border-width) solid var(--t-color-primary);

    .image {
      flex: none;
      width: rem(40px);
      height: rem(40px);
      border-radius: rem(6px);
      object-fit: cover;
    }

    .content {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: rem(1px);
      min-width: 0;

      .domain {
        color: var(--t-text-anchor-color);
      }

      .title {
        font-weight: bold;
        font-synthesis-weight: none;
      }

      .title,
      .description {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .dismiss {
      flex: none;
      display: flex;
      align-items: center;
    }
  }
</style>

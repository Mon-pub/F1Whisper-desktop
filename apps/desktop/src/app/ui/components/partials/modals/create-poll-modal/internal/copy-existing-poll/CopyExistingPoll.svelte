<!--
  @component Renders a modal with details about a message.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {CopyExistingPollProps} from '~/app/ui/components/partials/modals/create-poll-modal/internal/copy-existing-poll/props';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {formatLocalizedDate} from '~/app/ui/utils/timestamp';

  const {onclickexistingpoll, pollItemList}: CopyExistingPollProps = $props();

  const isEmpty = $derived(pollItemList.length <= 0);
</script>

<div class="container" class:empty-state={isEmpty}>
  {#if isEmpty}
    <Text
      alignment="center"
      color="mono-low"
      text={$i18n.t('dialog--copy-poll.prose--copy-polls-empty', 'No polls have been created yet.')}
    ></Text>
  {/if}

  {#each pollItemList as item (item.id)}
    <button class="item" onclick={() => onclickexistingpoll(item)}>
      <div class="top">
        <div class="left">
          <Text text={item.description} alignment="start"></Text>
        </div>
        <div class="right">
          <Text
            text={formatLocalizedDate(item.createdAt, $i18n)}
            alignment="end"
            color="mono-low"
            size="body-small"
          ></Text>
        </div>
      </div>
      <div class="bottom">
        <div class="left">
          <Text
            text={$i18n.t('dialog--copy-poll.prose--created-by', 'Created by {creator}', {
              creator:
                item.creator.type === 'self'
                  ? $i18n.t('contacts.label--own-name', 'Me')
                  : item.creator.name,
            })}
            alignment="start"
            color="mono-low"
          ></Text>
        </div>
        <div class="right">
          <IconButton flavor="naked" onclick={() => onclickexistingpoll(item)}>
            <MdIcon theme="Outlined">content_copy</MdIcon>
          </IconButton>
        </div>
      </div>
    </button>
  {/each}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;
    min-height: 100%;

    &.empty-state {
      align-items: center;
      justify-content: center;
    }

    .item {
      @extend %neutral-input;

      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: start;
      gap: rem(4px);
      padding: rem(10px) rem(16px);
      width: 100%;

      &:hover {
        cursor: pointer;
        background-color: var(--cc-conversation-preview-background-color--hover);
      }

      .top,
      .bottom {
        gap: rem(8px);
      }

      .top {
        display: flex;
        align-items: center;
        justify-content: stretch;

        .left {
          flex: 1 1 auto;

          display: flex;
          justify-content: start;
        }

        .right {
          flex: 0 0 auto;
        }
      }

      .bottom {
        display: flex;
        align-items: center;
        justify-content: stretch;

        .left {
          flex: 1 1 auto;

          display: flex;
          justify-content: start;
        }

        .right {
          flex: 0 0 auto;

          font-size: rem(10px);
          line-height: rem(10px);
        }
      }
    }
  }
</style>

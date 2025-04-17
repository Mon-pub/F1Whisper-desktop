<!--
  @component Renders a deleted message that can be used as part of a conversation.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Message from '~/app/ui/components/molecules/message/Message.svelte';
  import type {DeletedMessageProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/deleted-message/props';
  import MessageAvatarProvider from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-avatar-provider/MessageAvatarProvider.svelte';
  import MessageContextMenuProvider from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-context-menu-provider/MessageContextMenuProvider.svelte';
  import {i18n} from '~/app/ui/i18n';
  import {reactive} from '~/app/ui/utils/svelte';
  import {getDisplayTimestampForMessage} from '~/app/ui/utils/timestamp';
  import {extractErrorMessage} from '~/common/error';

  const {uiLogging, systemTime} = globals.unwrap();
  const log = uiLogging.logger('ui.component.deleted-message');

  const {
    boundary,
    conversation,
    direction,
    highlighted,
    id,
    onclickdeleteoption,
    onclickopendetailsoption,
    oncompletehighlightanimation,
    sender,
    services,
    status,
  }: DeletedMessageProps = $props();

  const {
    settings: {
      views: {appearance},
    },
  } = services;

  const timestamp = $derived(
    reactive(
      () => getDisplayTimestampForMessage($i18n, direction, status, $appearance.use24hTime),
      [$systemTime.current],
    ),
  );
</script>

<div class="container">
  <MessageAvatarProvider {conversation} {direction} {services} {sender}>
    <MessageContextMenuProvider
      {boundary}
      caretAnchorName={`--message-context-menu-caret-${id}`}
      enabledOptions={{
        copyLink: false,
        copySelection: false,
        copyImage: false,
        copy: false,
        edit: false,
        saveAsFile: false,
        quote: false,
        forward: false,
        openDetails: true,
        deleteMessage: true,
      }}
      emojiReactions={{enabled: false}}
      {onclickdeleteoption}
      {onclickopendetailsoption}
      placement={direction === 'inbound' ? 'right' : 'left'}
      {services}
    >
      {#snippet snippetMessage()}
        <div class="message">
          <Message
            alt={$i18n.t('messaging.hint--media-thumbnail')}
            content={{
              text: $i18n.t('messaging.prose--message-deleted', 'This message was deleted'),
            }}
            {direction}
            {highlighted}
            {oncompletehighlightanimation}
            onerror={(error) =>
              log.error(
                `An error occurred in a child component: ${extractErrorMessage(error, 'short')}`,
              )}
            options={{
              showSender: conversation.receiver.type !== 'contact',
              indicatorOptions: {
                hideStatus: conversation.receiver.type !== 'contact' && status.sent !== undefined,
              },
            }}
            quote={undefined}
            {sender}
            {services}
            {status}
            {timestamp}
          />
        </div>
      {/snippet}
    </MessageContextMenuProvider>
  </MessageAvatarProvider>
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    align-items: start;
    justify-content: start;
    gap: rem(8px);

    .message {
      border-radius: rem(10px);
      overflow: hidden;
    }
  }
</style>

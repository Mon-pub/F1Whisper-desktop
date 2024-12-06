<!--
  @component Renders a message that can be used as part of a conversation.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import OverlayProvider from '~/app/ui/components/hocs/overlay-provider/OverlayProvider.svelte';
  import Message from '~/app/ui/components/molecules/message/Message.svelte';
  import type {MessageProps} from '~/app/ui/components/molecules/message/props';
  import MessageAvatarProvider from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-avatar-provider/MessageAvatarProvider.svelte';
  import MessageContextMenuProvider from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-context-menu-provider/MessageContextMenuProvider.svelte';
  import {
    getTextContent,
    getTranslatedSyncButtonTitle,
    isUnsyncedOrSyncingFile,
    shouldShowReactionButtons,
  } from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/helpers';
  import EmojiReactionsStrip from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/internal/emoji-reactions-strip/EmojiReactionsStrip.svelte';
  import type {RegularMessageProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/props';
  import {transformMessageFileProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/transformers';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import IconButtonProgressBarOverlay from '~/app/ui/svelte-components/blocks/Button/IconButtonProgressBarOverlay.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {handleCopyImage, handleSaveAsFile} from '~/app/ui/utils/file-sync/handlers';
  import {syncAndGetPayload} from '~/app/ui/utils/file-sync/helpers';
  import {reactive} from '~/app/ui/utils/svelte';
  import {escapeHtmlUnsafeChars} from '~/app/ui/utils/text';
  import {getDisplayTimestampForMessage} from '~/app/ui/utils/timestamp';
  import {extractErrorMessage} from '~/common/error';
  import {EDIT_MESSAGE_GRACE_PERIOD_IN_MINUTES} from '~/common/network/protocol/constants';
  import {assertUnreachable, ensureError, unreachable} from '~/common/utils/assert';
  import {
    THUMBS_DOWN_EMOJIS,
    THUMBS_UP_EMOJIS,
    type SingleUnicodeEmoji,
  } from '~/common/utils/emoji';

  const {uiLogging, systemTime} = globals.unwrap();
  const log = uiLogging.logger('ui.component.message');

  type $$Props = RegularMessageProps;

  export let actions: $$Props['actions'];
  export let boundary: $$Props['boundary'] = undefined;
  export let conversation: $$Props['conversation'];
  export let direction: $$Props['direction'];
  export let emojiReactions: $$Props['emojiReactions'];
  export let file: $$Props['file'] = undefined;
  export let id: $$Props['id'];
  export let highlighted: $$Props['highlighted'] = undefined;
  export let quote: $$Props['quote'] = undefined;
  export let sender: $$Props['sender'] = undefined;
  export let services: $$Props['services'];
  export let status: $$Props['status'];
  export let text: $$Props['text'] = undefined;

  const {
    settings: {
      views: {appearance},
    },
  } = services;

  let quoteProps: MessageProps['quote'];

  function handleClickCopyOption(): void {
    if (text !== undefined) {
      navigator.clipboard
        .writeText(text.raw)
        .then(() =>
          toast.addSimpleSuccess(
            i18n
              .get()
              .t('messaging.success--copy-message-content', 'Message content copied to clipboard'),
          ),
        )
        .catch((error: unknown) => {
          log.error('Could not copy message content to clipboard', error);

          toast.addSimpleFailure(
            i18n
              .get()
              .t(
                'messaging.error--copy-message-content',
                'Could not copy message content to clipboard',
              ),
          );
        });
    } else {
      log.warn('Attempting to copy undefined message content');

      toast.addSimpleFailure(
        i18n.get().t('messaging.error--copy-undefined-message-content', 'Nothing to copy'),
      );
    }
  }

  function handleClickCopyImageOption(): void {
    handleCopyImage(file, log, $i18n.t, toast.addSimpleSuccess, toast.addSimpleFailure).catch(
      assertUnreachable,
    );
  }

  function handleClickSaveAsFileOption(): void {
    handleSaveAsFile(file, log, $i18n.t, toast.addSimpleFailure).catch(assertUnreachable);
  }

  function handleClickAcknowledgeOption(): void {
    actions.acknowledge().catch((error: unknown) => {
      log.error(`Could not react to message: ${extractErrorMessage(ensureError(error), 'short')}`);

      toast.addSimpleFailure(
        i18n.get().t('messaging.error--reaction', 'Could not react to message'),
      );
    });
  }

  function handleClickDeclineOption(): void {
    actions.decline().catch((error: unknown) => {
      log.error(`Could not react to message: ${extractErrorMessage(ensureError(error), 'short')}`);

      toast.addSimpleFailure(
        i18n.get().t('messaging.error--reaction', 'Could not react to message'),
      );
    });
  }

  async function handleClickSync(): Promise<void> {
    if (file === undefined) {
      return;
    }

    switch (file.sync.state) {
      case 'unsynced':
        // Start down- or upload.
        // TODO(DESK-961): Handle upload resumption for local unsynced files.
        // eslint-disable-next-line no-case-declarations
        const result = await syncAndGetPayload(file.fetchFileBytes, $i18n.t);
        switch (result.status) {
          case 'ok':
            break;

          case 'error':
            log.error(
              `File payload sync for message ${id} failed: ${extractErrorMessage(
                result.error,
                'short',
              )}`,
            );

            toast.addSimpleFailure(result.message);
            break;

          default:
            unreachable(result);
        }
        break;
      case 'syncing':
        /* TODO(DESK-948): Implement cancellation. */
        break;
      case 'synced':
      case 'failed':
        // Nothing to do.
        break;
      default:
        unreachable(file.sync.state);
    }
  }

  function handleClickFileInfo(): void {
    handleSaveAsFile(file, log, $i18n.t, toast.addSimpleFailure).catch(assertUnreachable);
  }

  function handleClickContextMenuEmojiReaction(event: CustomEvent<SingleUnicodeEmoji>): void {
    // Don't add the emoji if the feature is not supported by the receiver and it does not map to
    // thumbs up/down.
    if (
      !conversation.isEmojiReactionSupported &&
      !(THUMBS_UP_EMOJIS.has(event.detail) || THUMBS_DOWN_EMOJIS.has(event.detail))
    ) {
      return;
    }
    addOrRemoveEmojiReaction(event.detail);
  }

  function handleClickEmojiReactionStripBucket(emoji: SingleUnicodeEmoji): void {
    // TODO(DESK-1713): Remove this restriction.
    if (import.meta.env.BUILD_ENVIRONMENT === 'sandbox') {
      addOrRemoveEmojiReaction(emoji);
    }
  }

  function addOrRemoveEmojiReaction(emoji: SingleUnicodeEmoji): void {
    // TODO(DESK-1713): Remove this block
    if (import.meta.env.BUILD_ENVIRONMENT !== 'sandbox' || !conversation.isEmojiReactionSupported) {
      if (THUMBS_DOWN_EMOJIS.has(emoji)) {
        handleClickDeclineOption();
      } else if (THUMBS_UP_EMOJIS.has(emoji)) {
        handleClickAcknowledgeOption();
      }
      // Cannot apply a different emoji in version 1
      return;
    }
    actions.addOrRemoveEmojiReaction(emoji).catch((error) => {
      log.error(`Error adding or removing emoji reaction: ${error}`);

      toast.addSimpleFailure(
        i18n
          .get()
          .t('messaging.error--emoji-reaction-commit', 'Failed to apply emoji reaction change'),
      );
    });
  }

  function updateQuoteProps(rawQuote: $$Props['quote']): void {
    if (rawQuote === undefined) {
      quoteProps = undefined;
    } else if (rawQuote === 'not-found') {
      quoteProps = {
        type: 'not-found',
        fallbackText: $i18n.t(
          'messaging.error--quoted-message-not-found',
          'The quoted message could not be found',
        ),
      };
    } else if (rawQuote.type === 'deleted-message') {
      quoteProps = {
        type: 'deleted',
        fallbackText: $i18n.t(
          'messaging.error--quoted-message-deleted',
          'The quoted message was deleted',
        ),
      };
    } else {
      const sanitizedHtml = getTextContent(
        rawQuote.text?.raw,
        rawQuote.text?.mentions,
        $i18n.t,
        250,
      );

      quoteProps = {
        type: 'default',
        alt: $i18n.t('messaging.hint--media-thumbnail', 'Media preview'),
        content:
          sanitizedHtml === undefined
            ? undefined
            : {
                sanitizedHtml,
              },
        file: transformMessageFileProps(
          rawQuote.file,
          rawQuote.id,
          conversation.receiver.lookup,
          services,
        ),
        onError: (error) =>
          log.error(
            `An error occurred in a child component: ${extractErrorMessage(error, 'short')}`,
          ),
        sender: rawQuote.sender,
      };
    }
  }

  $: htmlContent =
    status.deleted !== undefined
      ? escapeHtmlUnsafeChars(
          $i18n.t('messaging.prose--message-deleted', 'This message was deleted'),
        )
      : getTextContent(text?.raw, text?.mentions, $i18n.t);

  $: shouldAllowReactions = shouldShowReactionButtons(
    conversation.receiver,
    direction,
    conversation.isEmojiReactionSupported,
    status.deleted?.at,
  );

  let showEditButton: boolean = false;
  $: showEditButton = reactive(
    () =>
      direction === 'outbound' &&
      status.deleted === undefined &&
      status.sent !== undefined &&
      // In left group chats, we do not show the edit button
      !(conversation.receiver.type === 'group' && conversation.receiver.isLeft) &&
      // For audio we don't support edits yet.
      !(file !== undefined && file.type === 'audio') &&
      Date.now() - status.sent.at.getTime() < EDIT_MESSAGE_GRACE_PERIOD_IN_MINUTES * 60000,
    [$systemTime.current],
  );

  $: timestamp = reactive(
    () => getDisplayTimestampForMessage($i18n, direction, status, $appearance.use24hTime),
    [$systemTime.current],
  );

  $: updateQuoteProps(quote);
</script>

<div class="container">
  <MessageAvatarProvider {conversation} {direction} {services} {sender}>
    <div class="content" data-alignment={direction === 'inbound' ? 'start' : 'end'}>
      <MessageContextMenuProvider
        {boundary}
        placement={direction === 'inbound' ? 'right' : 'left'}
        enabledOptions={{
          copyLink: true,
          copySelection: true,
          copyImage: file !== undefined && file.type === 'image',
          copy: text !== undefined,
          edit: showEditButton ? {disabled: !conversation.isEditingSupported} : false,
          saveAsFile: file !== undefined,
          quote:
            (conversation.receiver.type === 'contact'
              ? !conversation.receiver.isBlocked
              : !conversation.receiver.isDisabled) && status.deleted === undefined,
          // TODO(DESK-1400)
          forward: text !== undefined && file === undefined && status.deleted === undefined,
          openDetails: true,
          deleteMessage: true,
        }}
        emojiReactions={{
          enabled: shouldAllowReactions,
          fullSupport: conversation.isEmojiReactionSupported,
          ownReactions: emojiReactions.filter((reaction) => reaction.direction === 'outbound'),
        }}
        on:clickcopyimageoption={handleClickCopyImageOption}
        on:clickcopymessageoption={handleClickCopyOption}
        on:clicksaveasfileoption={handleClickSaveAsFileOption}
        on:clickquoteoption
        on:clickeditoption
        on:clickforwardoption
        on:clickopendetailsoption
        on:clickdeleteoption
        on:clickemojireaction={handleClickContextMenuEmojiReaction}
        on:clickemojireaction
      >
        <div class="message" slot="message">
          <OverlayProvider show={isUnsyncedOrSyncingFile(file)}>
            <svelte:fragment slot="above">
              {#if isUnsyncedOrSyncingFile(file)}
                {@const {sync} = file}
                <button class="sync-button" on:click={handleClickSync}>
                  {#if sync.state === 'unsynced'}
                    <MdIcon theme="Filled" title={getTranslatedSyncButtonTitle(file, $i18n.t)}>
                      {#if sync.direction === 'download'}
                        file_download
                      {:else if sync.direction === 'upload'}
                        file_upload
                      {:else if sync.direction === undefined}
                        help
                      {:else}
                        {unreachable(sync.direction)}
                      {/if}
                    </MdIcon>
                  {:else if sync.state === 'syncing'}
                    <!-- TODO(DESK-948): Cancellation <MdIcon theme="Filled">close</MdIcon>. -->
                    <IconButtonProgressBarOverlay />
                  {:else}
                    {unreachable(sync.state)}
                  {/if}
                </button>
              {/if}
            </svelte:fragment>
            <svelte:fragment slot="below">
              <!--TODO(DESK-771): Handle distribution list conversation type. -->
              <Message
                alt={$i18n.t('messaging.hint--media-thumbnail')}
                content={htmlContent === undefined
                  ? undefined
                  : {
                      sanitizedHtml: htmlContent,
                    }}
                {direction}
                file={transformMessageFileProps(file, id, conversation.receiver.lookup, services)}
                {highlighted}
                footerHint={status.edited
                  ? $i18n.t('messaging.prose--message-edited', 'Edited')
                  : undefined}
                onError={(error) =>
                  log.error(
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    `An error occurred in a child component: ${extractErrorMessage(error, 'short')}`,
                  )}
                options={{
                  showSender: conversation.receiver.type !== 'contact',
                  indicatorOptions: {
                    hideStatus:
                      conversation.receiver.type !== 'contact' && status.sent !== undefined,
                    fillReactions: conversation.receiver.type === 'contact',
                    alwaysShowNumber: conversation.receiver.type === 'group',
                  },
                  hideVideoPlayButton: isUnsyncedOrSyncingFile(file),
                }}
                quote={quoteProps}
                {sender}
                {status}
                {timestamp}
                on:clickfileinfo={handleClickFileInfo}
                on:clickthumbnail
                on:clickquote
                on:completehighlightanimation
              />
            </svelte:fragment>
          </OverlayProvider>
        </div>
      </MessageContextMenuProvider>
      <!-- TODO: Remove hardcoded reactions. -->
      <div class="reactions">
        <EmojiReactionsStrip
          {direction}
          onClickBucket={handleClickEmojiReactionStripBucket}
          reactions={emojiReactions}
        />
      </div>
    </div>
  </MessageAvatarProvider>
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    align-items: start;
    justify-content: start;
    gap: rem(8px);

    .content {
      display: flex;
      flex-direction: column;
      align-items: start;
      justify-content: start;

      .message {
        border-radius: rem(10px);
        overflow: hidden;

        .sync-button {
          --c-icon-button-progress-bar-overlay-color: var(--mc-message-overlay-button-color);

          --c-icon-button-naked-outer-background-color--hover: var(
            --mc-message-overlay-button-background-color--hover
          );
          --c-icon-button-naked-outer-background-color--focus: var(
            --mc-message-overlay-button-background-color--focus
          );
          --c-icon-button-naked-outer-background-color--active: var(
            --mc-message-overlay-button-background-color--active
          );

          @include clicktarget-button-circle;

          & {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--mc-message-overlay-button-color);
            background-color: var(--mc-message-overlay-button-background-color);
            width: rem(44px);
            height: rem(44px);
            font-size: rem(22px);
          }
        }
      }

      .reactions {
        z-index: 1;
        margin-top: rem(-5px);

        max-width: 100%;
      }

      &[data-alignment='end'] {
        align-items: end;
      }
    }
  }
</style>

<!--
  @component Renders details about a receiver of type `Contact`.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import type {ContactContentProps} from '~/app/ui/components/partials/contact-detail/internal/contact-content/props';
  import type {ModalState} from '~/app/ui/components/partials/contact-detail/internal/contact-content/types';
  import ThreemaIdInfoModal from '~/app/ui/components/partials/modals/threema-id-info-modal/ThreemaIdInfoModal.svelte';
  import VerificationLevelInfoModal from '~/app/ui/components/partials/modals/verification-level-info-modal/VerificationLevelInfoModal.svelte';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import VerificationDots from '~/app/ui/svelte-components/threema/VerificationDots/VerificationDots.svelte';
  import {mapToLabel} from '~/app/ui/utils/availability-status';
  import {getDoNotDisturbDuration} from '~/app/ui/utils/do-not-disturb';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';
  import {ReadReceiptPolicy, TypingIndicatorPolicy} from '~/common/enum';
  import {mapToColor, mapToIcon} from '~/common/utils/availability-status';

  const {systemTime} = globals.unwrap();

  const {onclickedit, onclickprofilepicture, receiver, services}: ContactContentProps = $props();

  const {
    settings: {
      views: {appearance, privacy},
    },
  } = services;

  let modalState = $state<ModalState>({type: 'none'});

  function handleClickThreemaIdInfoIcon(): void {
    modalState = {
      type: 'threema-id-info',
      props: {
        publicKey: receiver.publicKey,
      },
    };
  }

  function handleClickVerificationLevelInfoIcon(): void {
    modalState = {
      type: 'verification-level-info',
      props: {
        colors: receiver.verification.type,
      },
    };
  }

  function handleCloseModal(): void {
    modalState = {
      type: 'none',
    };
  }
</script>

<div class="container">
  <div class="profile-picture">
    <ProfilePicture
      {receiver}
      {services}
      onclick={onclickprofilepicture}
      options={{
        isClickable: true,
      }}
      size="lg"
    />

    {#if receiver.badge === 'contact-work' && import.meta.env.BUILD_VARIANT === 'consumer'}
      <div class="badge" data-badge={receiver.badge}>
        <span>
          {$i18n.t('contacts.label--badge-work', '{fullAppName} Contact', {
            // Only displayed in consumer builds. Therefore, this doesn't need to be adapted for
            // custom builds.
            fullAppName: 'Threema Work',
          })}
        </span>
      </div>
    {/if}

    <div class="details">
      <Text
        alignment="center"
        color="mono-high"
        family="secondary"
        size="body-large"
        text={receiver.name}
      />
      <button class="edit" onclick={onclickedit}>
        <Text
          color="inherit"
          family="secondary"
          size="body-small"
          text={$i18n.t('common.action--edit', 'Edit')}
        />
      </button>
    </div>
  </div>

  <KeyValueList>
    <KeyValueList.Section>
      {#if import.meta.env.BUILD_FLAVOR === 'work-sandbox' || import.meta.env.BUILD_FLAVOR === 'work-live'}
        {#if receiver.workAvailabilityStatus !== undefined}
          <KeyValueList.Item
            key={$i18n.t('contacts.label--availability-status', 'Availability Status')}
          >
            <div class="availability">
              <div
                class="icon"
                style:--c-availability-status-icon-color={mapToColor(
                  receiver.workAvailabilityStatus.category,
                )}
              >
                <MdIcon theme="Filled">{mapToIcon(receiver.workAvailabilityStatus.category)}</MdIcon
                >
              </div>

              <div class="content">
                <Text
                  text={mapToLabel(
                    receiver.workAvailabilityStatus.category,
                    receiver.workAvailabilityStatus.description,
                    $i18n,
                  )}
                />
              </div>
            </div>
          </KeyValueList.Item>
        {/if}
      {/if}

      <KeyValueList.Item
        key={$i18n.t('contacts.label--threema-id', '{shortAppName} ID', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
        onclickinfoicon={handleClickThreemaIdInfoIcon}
        options={{
          showInfoIcon: true,
        }}
      >
        {#if receiver.isBlocked}
          <span class="blocked-icon"> BLOCKED </span>
        {/if}
        <Text text={receiver.identity} selectable />
      </KeyValueList.Item>

      <KeyValueList.Item
        key={$i18n.t('contacts.label--verification-level', 'Verification Level')}
        onclickinfoicon={handleClickVerificationLevelInfoIcon}
        options={{
          showInfoIcon: true,
        }}
      >
        <span class="verification-dots">
          <VerificationDots
            colors={receiver.verification.type}
            verificationLevel={receiver.verification.level}
          />
        </span>
      </KeyValueList.Item>

      <KeyValueList.Item key={$i18n.t('contacts.label--nickname', 'Nickname')}>
        <Text text={receiver.nickname ?? '-'} selectable />
      </KeyValueList.Item>
    </KeyValueList.Section>

    <!-- TODO(DESK-1163):  When notification policies are respected by the system, show this in all
    environments. -->
    {#if import.meta.env.DEBUG}
      <KeyValueList.Section
        title={`🐞 ${$i18n.t('settings.label--notifications', 'Notifications')}`}
        options={{disableItemInset: true}}
      >
        <KeyValueList.Item key={$i18n.t('settings.label--do-not-disturb', 'Do Not Disturb')}>
          <Text
            text={getDoNotDisturbDuration(
              $appearance,
              $i18n,
              receiver.notificationPolicy,
              $systemTime,
            )}
            selectable
          />
        </KeyValueList.Item>

        {#if receiver.notificationPolicy.type === 'mentioned' || receiver.notificationPolicy.type === 'never'}
          <KeyValueList.ItemWithSwitch
            key={$i18n.t('settings.action--do-not-disturb-mentioned', 'Notify When Mentioned')}
            checked={receiver.notificationPolicy.type === 'mentioned'}
            disabled
          >
            {#if receiver.notificationPolicy.type === 'mentioned'}
              <Text
                text={$i18n.t(
                  'settings.prose--do-not-disturb-mentioned-on',
                  'You will only receive notifications when you are mentioned',
                )}
              />
            {:else}
              <Text
                text={$i18n.t(
                  'settings.prose--do-not-disturb-mentioned-off',
                  'You will not receive any notifications',
                )}
              />
            {/if}
          </KeyValueList.ItemWithSwitch>
        {/if}

        <KeyValueList.ItemWithSwitch
          key={$i18n.t('settings.label--play-notification-sound', 'Play Notification Sound')}
          checked={!receiver.notificationPolicy.isMuted}
          disabled
        >
          {#if receiver.notificationPolicy.isMuted}
            <Text text={$i18n.t('settings.action--play-notification-sound-off', 'Off')} />
          {:else}
            <Text text={$i18n.t('settings.action--play-notification-sound-default', 'On')} />
          {/if}
        </KeyValueList.ItemWithSwitch>
      </KeyValueList.Section>
    {/if}

    <KeyValueList.Section
      title={$i18n.t('settings.label--privacy', 'Privacy')}
      options={{disableItemInset: true}}
    >
      <KeyValueList.Item key={$i18n.t('settings.label--read-receipts', 'Read Receipts')}>
        {#if receiver.readReceiptPolicy === 'default'}
          <Text
            text={$i18n.t('settings.action--control-message-default', 'Default {policy}', {
              policy: `(${
                $privacy.readReceiptPolicy === ReadReceiptPolicy.DONT_SEND_READ_RECEIPT
                  ? $i18n.t('settings.action--control-message-do-not-send', "Don't Send")
                  : $i18n.t('settings.action--control-message-send', 'Send')
              })`,
            })}
            selectable
          />
        {:else if receiver.readReceiptPolicy === 'do-not-send'}
          <Text
            text={$i18n.t('settings.action--control-message-do-not-send', "Don't Send")}
            selectable
          />
        {:else if receiver.readReceiptPolicy === 'send'}
          <Text text={$i18n.t('settings.action--control-message-send', 'Send')} selectable />
        {:else}
          {svelteUnreachable(receiver.readReceiptPolicy)}
        {/if}
      </KeyValueList.Item>

      <KeyValueList.Item key={$i18n.t('settings.label--typing-indicator', 'Typing Indicator')}>
        {#if receiver.typingIndicatorPolicy === 'default'}
          <Text
            text={$i18n.t('settings.action--control-message-default', 'Default {policy}', {
              policy: `(${
                $privacy.typingIndicatorPolicy === TypingIndicatorPolicy.DONT_SEND_TYPING_INDICATOR
                  ? $i18n.t('settings.action--control-message-do-not-send', "Don't Send")
                  : $i18n.t('settings.action--control-message-send', 'Send')
              })`,
            })}
            selectable
          />
        {:else if receiver.typingIndicatorPolicy === 'do-not-send'}
          <Text
            text={$i18n.t('settings.action--control-message-do-not-send', "Don't Send")}
            selectable
          />
        {:else if receiver.typingIndicatorPolicy === 'send'}
          <Text text={$i18n.t('settings.action--control-message-send', 'Send')} selectable />
        {:else}
          {svelteUnreachable(receiver.typingIndicatorPolicy)}
        {/if}
      </KeyValueList.Item>
    </KeyValueList.Section>
  </KeyValueList>
</div>

{#if modalState.type === 'none'}
  <!-- No modal is displayed in this state. -->
{:else if modalState.type === 'threema-id-info'}
  <ThreemaIdInfoModal {...modalState.props} onclose={handleCloseModal} />
{:else if modalState.type === 'verification-level-info'}
  <VerificationLevelInfoModal {...modalState.props} onclose={handleCloseModal} />
{:else}
  {svelteUnreachable(modalState)}
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;

    .profile-picture {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: start;
      gap: rem(8px);
      padding: 0 rem(16px) rem(16px) rem(16px);

      .badge {
        @extend %font-meta-400;

        text-align: center;
        margin: rem(8px) 0;

        > span {
          padding: rem(2px) rem(4px);
          border-radius: rem(4px);
        }

        &[data-badge='contact-consumer'] > span {
          color: var(--cc-contact-details-badge-consumer-text-color);
          background-color: var(--cc-contact-details-badge-consumer-background-color);
        }

        &[data-badge='contact-work'] > span {
          color: var(--cc-contact-details-badge-work-text-color);
          background-color: var(--cc-contact-details-badge-work-background-color);
        }
      }

      .details {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: start;

        .edit {
          @extend %neutral-input;

          color: var(--t-color-primary);
          cursor: pointer;
        }
      }
    }

    .verification-dots {
      --c-verification-dots-size: #{rem(6px)};
    }
  }

  $-temp-vars: (--c-availability-status-icon-color);

  .availability {
    @extend %neutral-input;
    display: flex;
    align-items: flex-start;
    gap: rem(8px);
    .icon {
      display: inline-block;
      font-size: large;
      line-height: 1;
      vertical-align: top;
      transform: translateY(0.1em);
      color: var($-temp-vars, --c-availability-status-icon-color);
    }

    .content {
      display: flex;
      align-items: start;
      justify-content: start;
    }
  }
</style>

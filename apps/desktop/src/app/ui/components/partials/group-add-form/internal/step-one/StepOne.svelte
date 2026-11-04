<script lang="ts">
  import {untrack} from 'svelte';

  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import SearchBar from '~/app/ui/components/molecules/search-bar/SearchBar.svelte';
  import {isReceiverMatchingSearchTerm} from '~/app/ui/components/partials/address-book/helpers';
  import type {StepOneProps} from '~/app/ui/components/partials/group-add-form/internal/step-one/props';
  import TopBar from '~/app/ui/components/partials/group-add-form/internal/top-bar/TopBar.svelte';
  import ReceiverPreviewList from '~/app/ui/components/partials/receiver-preview-list/ReceiverPreviewList.svelte';
  import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
  import HiddenSubmit from '~/app/ui/generic/form/HiddenSubmit.svelte';
  import {i18n} from '~/app/ui/i18n';
  import WizardButton from '~/app/ui/svelte-components/blocks/Button/WizardButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {reactive} from '~/app/ui/utils/svelte';
  import {assert} from '~/common/utils/assert';
  import {derive} from '~/common/utils/store/derived-store';
  import type {AnyReceiverDataOrSelf} from '~/common/viewmodel/utils/receiver';

  const {
    contacts,
    onclickcancel,
    onformcontinue,
    onformcancel,
    onselectitem,
    selectedContacts,
    services,
  }: StepOneProps = $props();

  const log = globals.unwrap().uiLogging.logger('ui.component.group-add-form');

  let searchTerm: string | undefined = $state(undefined);

  function buildSelectableContacts(
    currentItems: typeof contacts,
    currentSearchTerm?: string,
  ): ReceiverPreviewListProps<unknown>['items'] {
    return currentItems
      .filter((itemStore) => {
        const item = itemStore.get();
        // Only retain contacts that were added manually by the user.
        if (item.receiver.type !== 'contact') {
          return false;
        }

        // For groups, we disallow adding invalid contacts.
        if (item.receiver.isInvalid) {
          return false;
        }

        // Filter items by search term.
        if (currentSearchTerm !== undefined && currentSearchTerm !== '') {
          return isReceiverMatchingSearchTerm(item.receiver, currentSearchTerm);
        }

        return true;
      })
      .map((itemStore) =>
        derive([itemStore], ([{currentValue: item}]) => {
          // Assertion is fine because we filter out the corresponding values above.
          assert(item.receiver.type === 'contact');

          const uid = item.receiver.lookup.uid;
          const isSelected = untrack(() => selectedContacts.has(uid));

          return {
            ...item,
            interaction: {
              mode: 'select',
              isSelected,
              onselect: (selected: boolean) => handleSelectReceiver(selected, item.receiver),
            },
          };
        }),
      );
  }

  function handleSelectReceiver(selected: boolean, receiver: AnyReceiverDataOrSelf): void {
    if (
      receiver.type === 'self' ||
      receiver.type === 'group' ||
      receiver.type === 'distribution-list'
    ) {
      log.debug('GroupAddForm receiver list should only contain contacts');
      return;
    }

    onselectitem(selected, receiver);
  }

  const allSelectableContacts = $derived(buildSelectableContacts(contacts));

  const filteredSelectableContacts = $derived(
    reactive(
      () => buildSelectableContacts(contacts, searchTerm),
      [searchTerm, selectedContacts.size, contacts],
    ),
  );

  const summaryContacts = $derived(
    allSelectableContacts.filter((item) => {
      const {receiver} = item.get();
      return receiver.type === 'contact' && selectedContacts.has(receiver.lookup.uid);
    }),
  );
</script>

<form
  class="container"
  onsubmit={(event) => {
    event.preventDefault();

    onformcontinue();
  }}
>
  <HiddenSubmit />
  <div class="bar">
    <TopBar {onclickcancel} />
  </div>
  <div class="search">
    <SearchBar
      bind:term={searchTerm}
      placeholder={$i18n.t('contacts.label--search-private-contacts', 'Search Contacts')}
      onclear={() => {}}
    />
  </div>

  <div class="content">
    {#if filteredSelectableContacts.length > 0 || summaryContacts.length > 0}
      <div class="list">
        <ReceiverPreviewList
          highlights={searchTerm}
          items={filteredSelectableContacts}
          summaryItems={summaryContacts}
          onselectitem={handleSelectReceiver}
          {services}
        />
      </div>
    {:else}
      <div class="notice">
        <div class="icon"><MdIcon theme="Outlined">info</MdIcon></div>
        <div class="text">
          <Text text={$i18n.t('contacts.hint--no-contacts', 'Your contact list is empty.')} wrap
          ></Text>
        </div>
      </div>
    {/if}
  </div>

  <div class="footer">
    <WizardButton onclick={onformcancel}>
      {$i18n.t('common.action--cancel', 'Cancel')}
    </WizardButton>

    <WizardButton onclick={onformcontinue}>
      {$i18n.t('common.action--next', 'Next')}
    </WizardButton>
  </div>
</form>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    background-color: var(--t-nav-background-color);
    grid-template:
      'bar' rem(64px)
      '.' rem(8px)
      'search' auto
      'content' auto
      '.' 1fr
      'footer' rem(64px);
    align-content: start;
    overflow: hidden;
    height: 100%;

    .bar {
      grid-area: bar;
      padding: rem(12px) rem(8px);
    }

    .search {
      grid-area: search;
      padding: 0 rem(16px) rem(12px);
    }

    .content {
      grid-area: content;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: start;
      gap: rem(8px);

      .list {
        grid-area: list;
        overflow-y: auto;
      }

      .notice {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--t-text-e2-color);
        margin-top: rem(16px);
        padding: rem(16px);
        user-select: none;

        .text {
          @extend %font-small-400;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: rem(8px);
          font-size: rem(16px);
        }
      }
    }

    .footer {
      grid-area: footer;

      display: flex;
      align-self: stretch;
      align-items: center;
      justify-content: space-between;

      background-color: var(--t-color-primary);
      padding: 0 rem(8px);
    }
  }
</style>

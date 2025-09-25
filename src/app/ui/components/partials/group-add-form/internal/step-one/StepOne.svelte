<script lang="ts">
  import SearchBar from '~/app/ui/components/molecules/search-bar/SearchBar.svelte';
  import type {StepOneProps} from '~/app/ui/components/partials/group-add-form/internal/step-one/props';
  import TopBar from '~/app/ui/components/partials/group-add-form/internal/top-bar/TopBar.svelte';
  import ReceiverPreviewList from '~/app/ui/components/partials/receiver-preview-list/ReceiverPreviewList.svelte';
  import HiddenSubmit from '~/app/ui/generic/form/HiddenSubmit.svelte';
  import {i18n} from '~/app/ui/i18n';
  import WizardButton from '~/app/ui/svelte-components/blocks/Button/WizardButton.svelte';

  let {
    contacts,
    onclickcancel,
    oncontinue,
    searchTerm = $bindable(),
    services,
  }: StepOneProps = $props();
</script>

<form
  class="container"
  onsubmit={(event) => {
    event.preventDefault();

    oncontinue();
  }}
>
  <HiddenSubmit />
  <div class="bar">
    <TopBar />
  </div>
  <div class="search">
    <SearchBar
      bind:term={searchTerm}
      placeholder={$i18n.t('contacts.label--search-private-contacts', 'Search Contacts')}
      onclear={() => {}}
    />
  </div>

  <div class="content">
    <div class="list">
      <ReceiverPreviewList highlights={searchTerm} items={contacts} {services} />
    </div>
  </div>

  <div class="footer">
    <WizardButton onclick={onclickcancel}>
      {$i18n.t('common.action--cancel', 'Cancel')}
    </WizardButton>

    <WizardButton onclick={oncontinue}>
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

<script lang="ts">
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {
    parse,
    type TreeExpandDetail,
    type TreeItem,
    type TreeItemType,
  } from '~/app/ui/svelte-components/generic/ObjectTree';
  // Self-import is required by Svelte 5 for recursive components...
  //
  // eslint-disable-next-line import/no-self-import
  import Self from '~/app/ui/svelte-components/generic/ObjectTree/ObjectTree.svelte';
  import {limited} from '~/app/ui/svelte-components/utils/array';
  import type {u53} from '~/common/types';

  interface Props {
    /**
     * Object and child object component types who will be handled by an external component.
     *
     * If an object type chosen here has been selected, the `expand` event will be fired for this
     * type.
     */
    readonly external?: readonly TreeItemType[];
    /**
     * Whether the tree view of the object is expanded.
     */
    readonly isExpanded?: boolean;
    /**
     * Key of the associated object. Used in case the object is a child of
     * another object.
     */
    readonly key?: string;
    /**
     * Maximum amount of children of the object to be displayed at once. The user can expand the
     * object by click on the `...` button.
     */
    readonly limit?: u53;
    /**
     * Object to be displayed in the component.
     */
    readonly object: TreeItem;
    readonly onexpand?: (detail: TreeExpandDetail) => void;
  }

  let {
    external = [],
    isExpanded = false,
    key = '',
    limit = Number.POSITIVE_INFINITY,
    object,
    onexpand,
  }: Props = $props();

  let limiter = $state<u53>(limit);
  // Parse the object and get its associated metadata.
  const info = $derived(parse(object));
  // Limit the amount of children displayed at once.
  const children = $derived(limited(info?.children ?? [], limiter));

  function expand(): void {
    if (info === undefined) {
      return;
    }

    // Expand objects that have children.
    if (info.children !== undefined) {
      isExpanded = !isExpanded;
    }

    // Dispatch the event to objects that should (also) be handled externally.
    if (external.includes(info.type)) {
      const detail: TreeExpandDetail = {object, info};
      onexpand?.(detail);
    }
  }
</script>

<!-- Internal dev component, doesn't need to be accessible for now. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="wrapper"
  class:clickable={children.items.length > 0 || external.includes(info.type)}
  class:expanded={isExpanded}
  onclick={expand}
  title="{info.type}{info.length !== undefined ? `(${info.length})` : ''}"
>
  <div class="marker" class:hide={children.items.length === 0}>
    <MdIcon theme="Filled">{isExpanded ? 'expand_more' : 'expand_less'}</MdIcon>
  </div>
  {#if key !== ''}
    <div class="key">{key}</div>
    <div class="separator">:</div>
  {/if}
  <div class="value" data-type={info.type}>
    {#if info.display.type}
      <span class="type">{info.type}</span>{#if info.length !== undefined}
        <span class="length">({info.length})</span>
      {/if}
    {/if}
    {#if info.display.value !== undefined}{info.display.value}{/if}
  </div>
</div>
{#if children.items.length > 0}
  <ul class:expanded={isExpanded}>
    <!-- eslint-disable-next-line svelte/require-each-key -->
    {#each children.items as [itemKey, itemValue]}
      <li>
        <Self
          {external}
          key={itemKey}
          {limit}
          object={itemValue}
          onexpand={(event) => onexpand?.(event)}
        />
      </li>
    {/each}
    {#if children.limited}
      <!-- Internal dev component, doesn't need to be accessible for now. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <li
        class="clickable expand"
        onclick={() => {
          limiter = Number.POSITIVE_INFINITY;
        }}
        title="Show all"
      >
        <MdIcon theme="Filled">expand_more</MdIcon>
      </li>
    {/if}
  </ul>
{/if}

<style lang="scss">
  @use 'component' as *;

  .wrapper {
    font-family: var(--c-object-tree-font-family, default);
    display: flex;
    align-items: center;

    .marker {
      display: grid;
      margin: 0 em(4px);

      &.hide {
        visibility: hidden;
      }
    }

    .key {
      color: var(--c-object-tree-key-color, default);
      white-space: nowrap;
    }

    .separator {
      margin: 0 em(4px) 0 0;
    }

    &:hover {
      background-color: var(--c-object-tree-background-color--hover, default);
    }

    &.clickable {
      cursor: pointer;
    }

    .value {
      color: var(--c-object-tree-key-color, default);
      &[data-type='undefined'],
      &[data-type='null'] {
        color: var(--c-object-tree-null-color, default);
      }
      &[data-type='Boolean'] {
        color: var(--c-object-tree-bool-color, default);
      }
      &[data-type='Number'] {
        color: var(--c-object-tree-number-color, default);
      }
      &[data-type='String'] {
        color: var(--c-object-tree-string-color, default);
      }
      .length {
        color: var(--c-object-tree-length-color, default);
      }
    }
  }

  ul {
    display: none;
    padding: 0;
    margin: 0 0 0 em(12px);
    list-style-type: none;
    border-left: solid 1px var(--c-object-tree-border-color, default);

    &.expanded {
      display: block;
    }

    .expand {
      text-align: center;
      cursor: pointer;
    }
  }
</style>

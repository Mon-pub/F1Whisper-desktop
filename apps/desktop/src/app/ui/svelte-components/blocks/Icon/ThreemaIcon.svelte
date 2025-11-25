<script lang="ts">
  import type {Snippet} from 'svelte';

  import Icon from '~/app/ui/svelte-components/blocks/Icon/Icon.svelte';

  interface Props {
    readonly children?: Snippet;
    /**
     * Let the icon appear disabled.
     */
    readonly disabled?: boolean;
    /**
     * Apply the desired icon theme.
     */
    readonly theme: 'Filled' | 'Outlined';
    /**
     * Optional title of the icon
     */
    readonly title?: string;
  }

  const {children, disabled = false, theme, title = ''}: Props = $props();
</script>

<Icon {disabled} {title} font={`Threema Icons ${theme}`}>
  {#if children}{@render children()}{:else}incognito{/if}
</Icon>

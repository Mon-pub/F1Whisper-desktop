<script lang="ts">
  import type {StoryContext} from '@storybook/addon-svelte-csf';
  import type {Snippet} from 'svelte';

  const {children, context}: {children: Snippet; context: StoryContext<Record<string, unknown>>} =
    $props();

  $effect(() => {
    document.documentElement.dataset.branding = context.globals.branding;
  });
</script>

{@render children()}

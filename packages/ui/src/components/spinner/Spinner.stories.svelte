<script module lang="ts">
  import {defineMeta} from '@storybook/addon-svelte-csf';

  import Spinner from './Spinner.svelte';

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const {Story} = defineMeta({
    title: 'Components/Spinner',
    component: Spinner,
    tags: ['autodocs'],
  });
</script>

<!--
  The default spinner fills its parent, so we wrap it in a sized container. `asChild` is used so we
  can control the outer element; args are intentionally ignored here.
-->
<Story name="Default (fills parent)" asChild>
  <div class="size-16">
    <Spinner />
  </div>
</Story>

<Story name="Small" args={{class: 'size-4'}} />

<Story name="Medium" args={{class: 'size-8'}} />

<Story name="Large" args={{class: 'size-16'}} />

<!-- 
  Demonstrates color inheritance from parent; the spinner takes the parent's text `color`.
-->
<Story name="Colored" asChild>
  <div class="text-primary-600">
    <Spinner class="size-8" />
  </div>
</Story>

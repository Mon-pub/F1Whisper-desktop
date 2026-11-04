<script module lang="ts">
  import {defineMeta} from '@storybook/addon-svelte-csf';
  import {fn} from 'storybook/test';

  import {createTestImageBytes} from '../../utils/test/create-test-image-bytes';

  import AvatarSelectionSummary, {
    type AvatarSelectionSummaryItem,
  } from './AvatarSelectionSummary.svelte';

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const {Story} = defineMeta({
    title: 'Components/AvatarSelectionSummary',
    component: AvatarSelectionSummary,
    tags: ['autodocs'],
    parameters: {
      layout: 'fullscreen',
    },
  });

  const names = [
    'Jane Doe',
    'John Doe',
    'Threema User with a very long name',
    'Lorem Ipsum',
    '🤖 Threema Emoji User',
    'ABCDEFGH',
    '12345678',
    'Another User',
    'Verylongnamewithoutanyspaces',
    'Max Muster',
    'Maxine Muster',
  ];

  const items: AvatarSelectionSummaryItem[] = names.map((name, index) => ({
    actions: {remove: {label: `Remove ${name}`, onclick: fn()}},
    color: (['teal', 'red', 'blue', 'amber', 'purple', 'green'] as const)[index % 6],
    description: `Profile picture of ${name}`,
    id: `${index}`,
    initials: name.slice(0, 2),
    label: name,
  }));

  const itemsWithoutActions: AvatarSelectionSummaryItem[] = items.map(({actions, ...rest}) => rest);

  // Example image, created as PNG data to match the pixel-based profile pictures used at runtime.
  const imageBytes = createTestImageBytes({width: 240, height: 240});
</script>

<!--
  Every selected item is displayed as its avatar with its label below it, and a charm to remove it
  from the selection. Labels which do not fit are ellipsized.
-->
<Story name="Default" args={{heading: '3 members selected', items: items.slice(0, 3)}}>
  {#snippet template(args)}
    <AvatarSelectionSummary {...args} />
  {/snippet}
</Story>

<!--
  The `heading` is optional. Without it, only the items are displayed.
-->
<Story name="Without Heading" args={{items: items.slice(0, 3)}}>
  {#snippet template(args)}
    <AvatarSelectionSummary {...args} />
  {/snippet}
</Story>

<!--
  An item is only removable if it provides the respective action. Without it, no charm is displayed
  on its avatar, i.e. the summary can also display a selection which cannot be changed.
-->
<Story
  name="Without Actions"
  args={{heading: '3 members selected', items: itemsWithoutActions.slice(0, 3)}}
>
  {#snippet template(args)}
    <AvatarSelectionSummary {...args} />
  {/snippet}
</Story>

<!--
  Items with a profile picture display it instead of their initials.
-->
<Story name="With Profile Pictures" args={{heading: '2 members selected'}}>
  {#snippet template(args)}
    {#await imageBytes then image}
      <AvatarSelectionSummary
        {...args}
        items={items.slice(0, 2).map((item) => ({...item, image}))}
      />
    {/await}
  {/snippet}
</Story>

<!--
  The summary is as high as a single row of items, and grows with them until the second row is
  partially visible. From there on, the items scroll, so that it is apparent that there are more of
  them than are displayed.
-->
<Story name="Scrolling" args={{heading: '11 members selected', items}}>
  {#snippet template(args)}
    <AvatarSelectionSummary {...args} />
  {/snippet}
</Story>

<!--
  Without any selected items, only the `heading` is displayed. Note: Whether an empty summary should
  be displayed at all is up to the consumer.
-->
<Story name="Empty" args={{heading: '0 members selected', items: []}}>
  {#snippet template(args)}
    <AvatarSelectionSummary {...args} />
  {/snippet}
</Story>

<script lang="ts">
  import {contextmenu} from '~/app/ui/actions/contextmenu';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import ContextMenuProvider from '~/app/ui/components/hocs/context-menu-provider/ContextMenuProvider.svelte';
  import Bubble from '~/app/ui/components/molecules/message/internal/bubble/Bubble.svelte';
  import {
    getContextMenuItems,
    getStatusMessageTextForStatus,
  } from '~/app/ui/components/partials/conversation/internal/message-list/internal/status-message/helpers';
  import type {StatusMessageProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/status-message/props';
  import type Popover from '~/app/ui/generic/popover/Popover.svelte';
  import type {AnchorPoint, VirtualRect} from '~/app/ui/generic/popover/types';
  import {i18n} from '~/app/ui/i18n';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {boundary, onclickdeleteoption, onclickopendetailsoption, store}: StatusMessageProps =
    $props();

  // No need for derivation here since a status message status is constant.
  const {status} = $store;

  let popover = $state<SvelteNullableBinding<Popover>>(null);
  let virtualTrigger = $state<VirtualRect | undefined>(undefined);

  const anchorPoints: AnchorPoint = {
    reference: {
      horizontal: 'left',
      vertical: 'bottom',
    },
    popover: {
      horizontal: 'left',
      vertical: 'top',
    },
  };

  function handleClickDelete(): void {
    popover?.close();
    onclickdeleteoption?.();
  }

  function handleClickMessageDetails(): void {
    popover?.close();
    onclickopendetailsoption?.();
  }

  function handleClickTrigger(): void {
    virtualTrigger = undefined;
  }

  function handleContextMenuEvent(event: MouseEvent): void {
    if (event.type === 'contextmenu') {
      virtualTrigger = {
        width: 0,
        height: 0,
        left: event.clientX,
        right: 0,
        top: event.clientY,
        bottom: 0,
      };

      popover?.open(event);
    } else {
      virtualTrigger = undefined;
    }
  }

  const menuItems = $derived(
    getContextMenuItems($i18n, handleClickMessageDetails, handleClickDelete),
  );
</script>

<div class="container">
  <div class="message" use:contextmenu={handleContextMenuEvent}>
    <Bubble padding="sm" direction="none">
      <Text
        text={getStatusMessageTextForStatus(status, $i18n)}
        color="mono-low"
        wrap={true}
        size="body-small"
        selectable={true}
      />
    </Bubble>
  </div>

  <ContextMenuProvider
    bind:popover
    {anchorPoints}
    closeOnClickOutside={true}
    container={boundary}
    offset={{left: 0, top: 4}}
    onclicktrigger={handleClickTrigger}
    items={menuItems}
    reference={virtualTrigger}
    triggerBehavior={virtualTrigger === undefined ? 'toggle' : 'open'}
  />
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    align-items: start;
    justify-content: start;
    gap: rem(4px);
  }
</style>

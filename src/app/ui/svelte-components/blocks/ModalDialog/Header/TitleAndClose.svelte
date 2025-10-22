<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {Modal} from '~/app/ui/svelte-components/blocks/ModalDialog';

  interface Props {
    modal: Modal;
    title: string;
  }

  const {modal, title}: Props = $props();
</script>

<div class="header">
  <Text wrap={false} ellipsis={true} text={title} size="body-large" alignment="start" />
  <button class="close" onclick={modal.close}>
    <MdIcon theme="Outlined">close</MdIcon>
  </button>
</div>

<style lang="scss">
  @use 'component' as *;

  .header {
    padding: rem(16px);
    display: grid;
    grid-template: 'text icon' auto / 1fr min-content;
    place-items: center;
    overflow: hidden;

    .close {
      @include def-var(--c-icon-font-size, #{rem(24px)});
      @include clicktarget-button-circle;

      & {
        padding: rem(4px);
      }
    }
  }
</style>

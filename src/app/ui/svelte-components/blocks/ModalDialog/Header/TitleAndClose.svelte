<script lang="ts">
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {Modal} from '~/app/ui/svelte-components/blocks/ModalDialog';

  interface Props {
    modal: Modal;
    title: string;
  }

  const {modal, title}: Props = $props();
</script>

<div class="header">
  <div class="title">{title}</div>
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

    .title {
      @extend %font-large-400;
      text-align: left;
      width: 100%;
    }

    .close {
      @include def-var(--c-icon-font-size, #{rem(24px)});
      @include clicktarget-button-circle;

      & {
        padding: rem(4px);
      }
    }
  }
</style>

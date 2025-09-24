<script lang="ts">
  import type {KeyValueListProps} from '~/app/ui/components/molecules/key-value-list/props';

  const {children}: KeyValueListProps = $props();
</script>

<div class="list">
  {@render children?.()}
</div>

<style lang="scss">
  @use 'component' as *;

  .list {
    position: relative;
  }
</style>

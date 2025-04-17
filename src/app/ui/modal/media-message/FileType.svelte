<script lang="ts">
  import type {FilenameDetails} from '~/common/utils/file';

  interface Props {
    filenameDetails: FilenameDetails;
  }

  const {filenameDetails}: Props = $props();
</script>

<div>
  {filenameDetails.displayType === undefined ? '?' : filenameDetails.displayType.substring(0, 4)}
</div>

<style lang="scss">
  @use 'component' as *;

  div {
    display: grid;
    place-items: center;
    text-transform: uppercase;
    background-image: var(--cc-media-message-file-type-background-image);
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    color: var(--cc-media-message-file-type-text-color);
    width: 100%;
    height: 100%;
    user-select: none;
  }
</style>

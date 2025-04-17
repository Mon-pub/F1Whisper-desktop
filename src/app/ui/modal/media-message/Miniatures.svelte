<script lang="ts">
  import type {MediaFile, ValidationResult} from '~/app/ui/modal/media-message';
  import Miniature from '~/app/ui/modal/media-message/Miniature.svelte';
  import FileTrigger from '~/app/ui/svelte-components/blocks/FileTrigger/FileTrigger.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {FileResult} from '~/app/ui/svelte-components/utils/filelist';
  import type {u53} from '~/common/types';

  interface Props {
    readonly activeMediaFileIndex: u53;
    /**
     * Whether or not more files can be attached.
     */
    readonly moreFilesAttachable: boolean;
    readonly ondropfiles?: (files: FileResult) => void;
    readonly onselect: (file: MediaFile) => void;
    readonly validatedMediaFiles: readonly [mediaFile: MediaFile, result: ValidationResult][];
  }

  const {
    activeMediaFileIndex,
    moreFilesAttachable,
    ondropfiles,
    onselect,
    validatedMediaFiles,
  }: Props = $props();

  const [activeMediaFile] = $derived(validatedMediaFiles[activeMediaFileIndex] ?? []);
</script>

<ul>
  <!-- Key not required because all values are derived from `validatedMediaFiles`. -->
  <!-- eslint-disable-next-line svelte/require-each-key -->
  {#each validatedMediaFiles as [mediaFile, validationResult]}
    <li>
      <Miniature
        {mediaFile}
        {validationResult}
        active={mediaFile === activeMediaFile}
        onclick={() => onselect(mediaFile)}
      />
    </li>
  {/each}

  {#if moreFilesAttachable}
    <FileTrigger multiple {ondropfiles}>
      <li>
        <button type="button" class="file add">
          <MdIcon theme="Outlined">add</MdIcon>
        </button>
      </li>
    </FileTrigger>
  {/if}
</ul>

<style lang="scss">
  @use 'component' as *;

  ul {
    display: flex;
    flex-direction: row;
    column-gap: rem(8px);
    align-items: end;
    list-style-type: none;
    overflow-x: scroll;
    padding: 0;
    padding-top: rem(5px);
    margin: 0;
  }

  button {
    @include clicktarget-button-circle;

    & {
      border-radius: rem(4px);
      overflow: hidden;
    }

    &:disabled {
      opacity: 1;
    }
  }

  button.add {
    $-file-size: rem(64px);
    height: $-file-size;
    width: $-file-size;
    display: flex;
    place-content: center;
    background-color: var(--cc-media-message-miniatures-background-color);
    outline: none;
    font-size: rem(24px);
    color: var(--t-color-primary);
  }
</style>

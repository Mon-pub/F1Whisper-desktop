<!--
  @component Open a file upload dialog and trigger a custom fileDrop event.
-->
<script lang="ts">
  import type {Snippet} from 'svelte';

  import {type FileResult, validateFileList} from '~/app/ui/svelte-components/utils/filelist';
  import {unwrap} from '~/common/utils/assert';

  interface Props {
    /**
     * Optional file type filter, comma-separated list of unique file type specifiers
     * (see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file#unique_file_type_specifiers).
     */
    readonly accept?: string;
    readonly children?: Snippet;
    /**
     * Whether to accept multiple files.
     */
    readonly multiple?: boolean;
    readonly ondropfiles?: (files: FileResult) => void;
  }

  const {accept = '', children, multiple = false, ondropfiles}: Props = $props();

  let fileInput = $state<HTMLInputElement | null>(null);
  let form = $state<HTMLFormElement | null>(null);

  function triggerFile(): void {
    fileInput?.click();
  }

  async function handleFiles(): Promise<void> {
    const fileList = unwrap(fileInput).files;
    if (fileList === null) {
      return;
    }

    const fileResult = await validateFileList(fileList);
    ondropfiles?.(fileResult);

    form?.reset();
  }
</script>

<button onclick={triggerFile} style:display="inline-block">
  {@render children?.()}

  <form bind:this={form}>
    <input
      style:display="none"
      bind:this={fileInput}
      type="file"
      {accept}
      {multiple}
      oninput={handleFiles}
    />
  </form>
</button>

<style lang="scss">
  @use 'component' as *;

  button {
    @extend %neutral-input;
  }
</style>

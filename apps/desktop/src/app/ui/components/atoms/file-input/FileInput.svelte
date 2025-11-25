<!--
  @component Display and handle a file dialog.
-->
<script lang="ts">
  import type {FileInputProps} from '~/app/ui/components/atoms/file-input/props';
  import {validateFileList} from '~/app/ui/svelte-components/utils/filelist';

  let {
    accept = '',
    multiple = false,
    fileInput = $bindable(null),
    ondropfiles,
  }: FileInputProps = $props();

  let form = $state<HTMLFormElement | null>(null);

  async function handleFiles(): Promise<void> {
    if (fileInput === null) {
      return;
    }
    const fileList = fileInput.files;
    if (fileList === null) {
      return;
    }

    const fileResult = await validateFileList(fileList);
    ondropfiles?.(fileResult);

    form?.reset();
  }
</script>

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

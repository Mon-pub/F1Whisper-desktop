<script lang="ts">
  import {onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {QuotedAudioProps} from '~/app/ui/components/molecules/message/internal/quote/internal/quoted-audio/props';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {f64} from '~/common/types';
  import {assertUnreachable} from '~/common/utils/assert';
  import {computeAudioDuration} from '~/common/utils/audio';
  import {durationToString} from '~/common/utils/date';

  const {uiLogging} = globals.unwrap();

  const log = uiLogging.logger('ui.component.quoted-audio');

  const {expectedDuration, fetchFileBytes}: QuotedAudioProps = $props();

  let duration = $state<f64>(expectedDuration);

  async function fetchFileBytesAndDuration(): Promise<void> {
    let fileBytesAndMediaType;
    try {
      fileBytesAndMediaType = await fetchFileBytes();
    } catch (error) {
      log.debug('Failed to fetch file bytes:', error);
      return;
    }
    if (fileBytesAndMediaType === undefined) {
      return;
    }
    const realDuration = await computeAudioDuration(new Blob([fileBytesAndMediaType.bytes]), log);

    if (realDuration === undefined) {
      return;
    }

    duration = realDuration;
  }

  onMount(() => {
    fetchFileBytesAndDuration().catch(assertUnreachable);
  });
</script>

<div class="container">
  <MdIcon theme="Outlined">mic</MdIcon>
  <Text text={durationToString(duration)} wrap={false} />
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    align-items: center;
    gap: rem(8px);
  }
</style>

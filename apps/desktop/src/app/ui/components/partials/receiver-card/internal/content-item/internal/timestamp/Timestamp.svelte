<!--
  @component Renders the supplied date as a friendly timestamp, relative to the current datetime.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {TimestampProps} from '~/app/ui/components/partials/receiver-card/internal/content-item/internal/timestamp/props';
  import {i18n} from '~/app/ui/i18n';
  import {reactive} from '~/app/ui/utils/svelte';
  import {formatDateLocalized} from '~/app/ui/utils/timestamp';

  const {systemTime} = globals.unwrap();

  const {date, format = 'auto', services}: TimestampProps = $props();

  const {
    settings: {
      views: {appearance},
    },
  } = services;

  const timestamp = $derived(
    reactive(
      () => formatDateLocalized(date, $i18n, format, $appearance.use24hTime),
      [$systemTime.current, date],
    ),
  );
</script>

<Text size="body-small" text={timestamp} wrap={false} />

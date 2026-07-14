<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import {createDropdownItems} from '~/app/ui/components/partials/settings/helpers';
  import {
    getAutoDownloadLabel,
    getAutodownloadDropdown,
  } from '~/app/ui/components/partials/settings/internal/media-settings/helpers';
  import type {MediaSettingsProps} from '~/app/ui/components/partials/settings/internal/media-settings/props';
  import {i18n} from '~/app/ui/i18n';
  import {AnimatedImageMode} from '~/common/enum';

  const {actions, services, settings}: MediaSettingsProps = $props();

  const autoDownloadDropdownItems = $derived(
    createDropdownItems(getAutodownloadDropdown($i18n), (newValue) => {
      actions.updateSettings({autoDownload: newValue});
    }),
  );

  /**
   * TODO(DESK-1998): Revert the commit that added this comment
   * const videoQualityDropdownItems = $derived(
   * createDropdownItems(getVideoQualityDropdown($i18n), (newValue) => {
   * actions.updateSettings({videoQuality: newValue});
   * }),
   * );
   **/

  function onToggleAnimatedImageModeSettings(): void {
    actions.updateSettings({
      animatedImageMode:
        settings.animatedImageMode === AnimatedImageMode.LOOP
          ? AnimatedImageMode.DONT_LOOP
          : AnimatedImageMode.LOOP,
    });
    // Clear the blob-cache so that the setting can be correctly applied when going back to the
    // converation view.
    services.thumbnailCache.clearCache();
  }
</script>

<KeyValueList>
  <KeyValueList.Section title={$i18n.t('settings--media.label--section-media', 'Media')}>
    <KeyValueList.ItemWithDropdown
      items={autoDownloadDropdownItems}
      key={$i18n.t('settings--media.label--auto-save', 'Auto-Download Incoming Media')}
    >
      <Text text={getAutoDownloadLabel(settings.autoDownload, $i18n)}></Text>
    </KeyValueList.ItemWithDropdown>
    <KeyValueList.ItemWithSwitch
      checked={settings.animatedImageMode === AnimatedImageMode.LOOP}
      onswitch={onToggleAnimatedImageModeSettings}
      key={$i18n.t('settings--media.label--gifs', 'GIFs')}
      ><Text
        text={$i18n.t(
          'settings--media.prose--play-gifs',
          'Automatically play GIFs if smaller than 5 MB',
        )}
      ></Text>
    </KeyValueList.ItemWithSwitch>
    <KeyValueList.ItemWithSwitch
      checked={settings.linkPreviews}
      onswitch={() => actions.updateSettings({linkPreviews: !settings.linkPreviews})}
      key={$i18n.t('settings--media.label--link-previews', 'Generate Link Previews')}
      ><Text
        text={$i18n.t(
          'settings--media.prose--link-previews',
          'Generate a preview for the first link in your outgoing messages. Only you fetch the link; the preview is sent end-to-end so the recipient never contacts the URL.',
        )}
      ></Text>
    </KeyValueList.ItemWithSwitch>
    <!-- TODO(DESK-1998): Revert the commit that added this comment
    <KeyValueList.ItemWithDropdown
      items={videoQualityDropdownItems}
      key={$i18n.t('settings--media.label--video-quality', 'Video Quality')}
      ><Text text={getVideoQualityLabel(settings.videoQuality, $i18n)}></Text>
    </KeyValueList.ItemWithDropdown>
    -->
  </KeyValueList.Section>
</KeyValueList>

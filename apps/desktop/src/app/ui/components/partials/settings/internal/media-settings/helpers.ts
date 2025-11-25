import type {SettingsDropdown} from '~/app/ui/components/partials/settings/types';
import type {I18nType} from '~/app/ui/i18n-types';
import {MediaSettings_VideoQuality} from '~/common/internal-protobuf/settings';
import type {AutoDownload} from '~/common/model/settings/media';
import type {MediaSettingsView} from '~/common/model/types/settings';
import {RESTRICTED_DOWNLOAD_SIZE_IN_MB} from '~/common/settings/media';
import {unreachable} from '~/common/utils/assert';

export function getAutoDownloadLabel(autoDownload: AutoDownload, i18n: I18nType): string {
    if (!autoDownload.on) {
        return i18n.t('settings--media.label--auto-download-off', 'Never download');
    } else if (autoDownload.limitInMb === 0) {
        return i18n.t('settings--media.label--auto-download-on', 'Always download');
    }
    return i18n.t(
        'settings--media.label--auto-download-on-restricted',
        'Download if smaller than {restrictedSize} MB',
        {restrictedSize: `${autoDownload.limitInMb}`},
    );
}

export function getVideoQualityLabel(
    quality: Exclude<MediaSettings_VideoQuality, MediaSettings_VideoQuality.UNRECOGNIZED>,
    i18n: I18nType,
): string {
    switch (quality) {
        case MediaSettings_VideoQuality.LOW:
            return i18n.t('settings--media.label--video-quality-low', 'Low');
        case MediaSettings_VideoQuality.MEDIUM:
            return i18n.t('settings--media.label--video-quality-medium', 'Medium');
        case MediaSettings_VideoQuality.HIGH:
            return i18n.t('settings--media.label--video-quality-high', 'High');
        default:
            return unreachable(quality);
    }
}

export function getAutodownloadDropdown(
    i18n: I18nType,
): SettingsDropdown<MediaSettingsView, AutoDownload> {
    return {
        updateKey: 'autoDownload',
        items: [
            {
                text: getAutoDownloadLabel({on: false}, i18n),
                value: {on: false},
            },
            {
                text: getAutoDownloadLabel(
                    {on: true, limitInMb: RESTRICTED_DOWNLOAD_SIZE_IN_MB},
                    i18n,
                ),

                value: {on: true, limitInMb: RESTRICTED_DOWNLOAD_SIZE_IN_MB},
            },

            {
                text: getAutoDownloadLabel({on: true, limitInMb: 0}, i18n),
                value: {on: true, limitInMb: 0},
            },
        ],
    };
}

export function getVideoQualityDropdown(
    i18n: I18nType,
): SettingsDropdown<
    MediaSettingsView,
    Exclude<MediaSettings_VideoQuality, MediaSettings_VideoQuality.UNRECOGNIZED>
> {
    return {
        updateKey: 'videoQuality',
        items: [
            {
                text: getVideoQualityLabel(MediaSettings_VideoQuality.LOW, i18n),
                value: MediaSettings_VideoQuality.LOW,
            },
            {
                text: getVideoQualityLabel(MediaSettings_VideoQuality.MEDIUM, i18n),
                value: MediaSettings_VideoQuality.MEDIUM,
            },

            {
                text: getVideoQualityLabel(MediaSettings_VideoQuality.HIGH, i18n),
                value: MediaSettings_VideoQuality.HIGH,
            },
        ],
    };
}

import type {ProfilePictureShareWithOptions} from '~/app/ui/components/partials/settings/internal/profile-settings/types';
import type {I18nType} from '~/app/ui/i18n-types';
import {unreachable} from '~/common/utils/assert';

/**
 * Returns the corresponding label for a specific value of
 * {@link ProfilePictureShareWithOptions}.
 */
export function getProfilePictureShareWithLabel(
    label: ProfilePictureShareWithOptions,
    i18n: I18nType,
): string {
    switch (label) {
        case 'nobody':
            return i18n.t('settings--profile.label--profile-picture-nobody', 'Nobody');

        case 'everyone':
            return i18n.t(
                'settings--profile.label--profile-picture-everyone',
                'Everyone you write to',
            );

        case 'allowList':
            return i18n.t('settings--profile.label--profile-picture-selected', 'Selected contacts');

        default:
            return unreachable(label);
    }
}

import type {ProfilePictureShareWithOptions} from '~/app/ui/components/partials/settings/internal/profile-settings/types';
import type {SettingsDropdown} from '~/app/ui/components/partials/settings/types';
import type {I18nType} from '~/app/ui/i18n-types';
import type {ProfilePictureShareWith} from '~/common/model/settings/profile';
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

/**
 * F1Whisper fork (FU-H07): the editable subset of {@link ProfilePictureShareWith} exposed to
 * standalone identities. `allowList` is deliberately not offered here yet -- it needs a
 * contact-picker UI this settings page does not have; the label already exists for when that is
 * built.
 */
export type EditableProfilePictureShareWith = Extract<
    ProfilePictureShareWith,
    {readonly group: 'everyone' | 'nobody'}
>;

/**
 * Dropdown items for the editable profile-picture visibility choices (F1Whisper fork, FU-H07).
 */
export function getProfilePictureShareWithDropdown(
    i18n: I18nType,
): SettingsDropdown<
    Record<EditableProfilePictureShareWith['group'], string>,
    EditableProfilePictureShareWith['group'],
    undefined
> {
    return {
        updateKey: undefined,
        items: [
            {
                text: getProfilePictureShareWithLabel('everyone', i18n),
                value: 'everyone',
            },
            {
                text: getProfilePictureShareWithLabel('nobody', i18n),
                value: 'nobody',
            },
        ],
    };
}

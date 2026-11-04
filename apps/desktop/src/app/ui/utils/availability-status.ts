import type {I18nType} from '~/app/ui/i18n-types';
import {WorkAvailabilityStatusCategory} from '~/common/enum';
import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';
import {unreachable} from '~/common/utils/assert';

export function mapToLabel(
    category: WorkAvailabilityStatus['category'],
    description: string | undefined,
    i18n: I18nType,
): string {
    const trimmed = description?.trim();
    if (trimmed !== undefined && trimmed !== '') {
        return trimmed;
    }

    switch (category) {
        case WorkAvailabilityStatusCategory.NONE:
            return i18n.t('contacts.hint--availability-status-available', 'No status');

        case WorkAvailabilityStatusCategory.BUSY:
            return i18n.t('contacts.hint--availability-status-busy', 'Busy');

        case WorkAvailabilityStatusCategory.UNAVAILABLE:
            return i18n.t('contacts.hint--availability-status-unavailable', 'Unavailable');

        default:
            return unreachable(category);
    }
}

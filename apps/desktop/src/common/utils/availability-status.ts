import {WorkAvailabilityStatusCategory} from '~/common/enum';
import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';
import {unreachable} from '~/common/utils/assert';

export function mapToIcon(category: WorkAvailabilityStatus['category']): string {
    switch (category) {
        case WorkAvailabilityStatusCategory.NONE:
            return 'circle';

        case WorkAvailabilityStatusCategory.BUSY:
            return 'schedule';

        case WorkAvailabilityStatusCategory.UNAVAILABLE:
            return 'do_not_disturb_on';

        default:
            return unreachable(category);
    }
}

export function mapToColor(category: WorkAvailabilityStatus['category']): string {
    switch (category) {
        case WorkAvailabilityStatusCategory.NONE:
            return 'var(--cc-profile-picture-overlay-badge-icon-availability-status-nostatus-color)';

        case WorkAvailabilityStatusCategory.BUSY:
            return 'var(--cc-profile-picture-overlay-badge-icon-availability-status-busy-color)';

        case WorkAvailabilityStatusCategory.UNAVAILABLE:
            return 'var(--cc-profile-picture-overlay-badge-icon-availability-status-unavailable-color)';

        default:
            return unreachable(category);
    }
}

/**
 * Map WorkAvailabilityStatusCategory to string.
 */
export function mapToString(
    category: WorkAvailabilityStatusCategory,
): 'none' | 'busy' | 'unavailable' {
    switch (category) {
        case WorkAvailabilityStatusCategory.NONE:
            return 'none';

        case WorkAvailabilityStatusCategory.BUSY:
            return 'busy';

        case WorkAvailabilityStatusCategory.UNAVAILABLE:
            return 'unavailable';

        default:
            return unreachable(category);
    }
}

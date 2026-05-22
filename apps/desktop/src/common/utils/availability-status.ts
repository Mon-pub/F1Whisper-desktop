import {WorkAvailabilityStatusCategory} from '~/common/enum';
import {unreachable} from '~/common/utils/assert';

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

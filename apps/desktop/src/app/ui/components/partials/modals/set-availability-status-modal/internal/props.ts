import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';

export interface AvailabilityStatusCategoryProps {
    readonly selected: boolean;
    readonly category: WorkAvailabilityStatus['category'];
    readonly onclick: (category: WorkAvailabilityStatus['category']) => void;
}

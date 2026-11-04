import type {WorkAvailabilityStatusCategory} from '~/common/enum';

export interface WorkAvailabilityStatus {
    readonly category: WorkAvailabilityStatusCategory;
    readonly description: string;
}

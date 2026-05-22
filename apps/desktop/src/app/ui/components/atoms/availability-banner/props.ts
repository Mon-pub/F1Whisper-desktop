import type {WorkAvailabilityStatusCategory} from '~/common/enum';

/**
 * Props accepted by the `AvailabilityBanner` component.
 */
export interface AvailabilityBannerProps {
    readonly status:
        | WorkAvailabilityStatusCategory.BUSY
        | WorkAvailabilityStatusCategory.UNAVAILABLE;
    readonly description?: string;
    readonly showIcon?: boolean;
    readonly expandOnHover?: boolean;
    readonly align?: 'left' | 'center';
    readonly onEdit?: () => void;
}

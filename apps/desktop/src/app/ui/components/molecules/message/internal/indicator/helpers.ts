import type {IndicatorProps} from '~/app/ui/components/molecules/message/internal/indicator/props';
import type {u53} from '~/common/types';

interface IndicatorElement {
    icon: string;
    color?: 'acknowledged' | 'declined' | 'error';
    count?: u53;
    filled?: boolean;
    title?: string;
}

/**
 * Returns a list of indicator elements to display.
 */
export function getIndicatorElements(
    direction: IndicatorProps['direction'],
    options: NonNullable<IndicatorProps['options']>,
    status: IndicatorProps['status'],
): IndicatorElement[] {
    if (status.deleted !== undefined) {
        return [];
    }

    if (options.hideStatus === true) {
        return [];
    }

    if (direction === 'inbound') {
        return [];
    }

    const statusElement = getIndicatorElementForStatus(status);
    if (statusElement !== undefined) {
        return [statusElement];
    }

    return [];
}

function getIndicatorElementForStatus(
    status: IndicatorProps['status'],
): IndicatorElement | undefined {
    if (status.error !== undefined) {
        return {
            icon: 'report_problem',
            color: 'error',
            filled: true,
        };
    }
    if (status.read !== undefined) {
        return {
            icon: 'visibility',
            filled: true,
        };
    }
    if (status.delivered !== undefined) {
        return {
            icon: 'move_to_inbox',
            filled: true,
        };
    }
    if (status.sent !== undefined) {
        return {
            icon: 'email',
            filled: true,
        };
    }
    if (status.received !== undefined) {
        return undefined;
    }

    return {
        icon: 'file_upload',
        filled: true,
    };
}

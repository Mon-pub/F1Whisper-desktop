import type {IndicatorProps} from '~/app/ui/components/partials/receiver-card/internal/content-item/internal/indicator/props';

interface IndicatorElement {
    icon: string;
    color?: 'acknowledged' | 'declined' | 'error';
}

/**
 * Returns a list of indicator elements to display.
 */
export function getIndicatorElement(
    receiverType: IndicatorProps['conversation']['receiver']['type'],
    status: IndicatorProps['status'],
    options: NonNullable<IndicatorProps['options']> = {},
): IndicatorElement | undefined {
    if (receiverType === 'group') {
        return {
            icon: 'group',
        };
    }

    if (options.hideStatus === true) {
        return undefined;
    }

    return getIndicatorElementForStatus(status);
}

function getIndicatorElementForStatus(
    status: IndicatorProps['status'],
): IndicatorElement | undefined {
    if (status.error !== undefined) {
        return {
            icon: 'report_problem',
            color: 'error',
        };
    }
    if (status.received !== undefined) {
        return {
            icon: 'reply',
        };
    }
    if (status.read !== undefined) {
        return {
            icon: 'visibility',
        };
    }
    if (status.delivered !== undefined) {
        return {
            icon: 'move_to_inbox',
        };
    }
    if (status.sent !== undefined) {
        return {
            icon: 'email',
        };
    }

    return {
        icon: 'file_upload',
    };
}

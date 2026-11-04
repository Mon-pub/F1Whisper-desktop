import type {u53} from '@threema/ts-utils/integer/u53';

import type {IndicatorProps} from '~/app/ui/components/molecules/message/internal/indicator/props';
import type {I18nType} from '~/app/ui/i18n-types';
import {unreachable} from '~/common/utils/assert';

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
    t: I18nType['t'],
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

    const statusElement = getIndicatorElementForStatus(status, t);
    if (statusElement !== undefined) {
        return [statusElement];
    }

    return [];
}

function getIndicatorElementForStatus(
    status: IndicatorProps['status'],
    t: I18nType['t'],
): IndicatorElement | undefined {
    if (status.error !== undefined) {
        return {
            icon: 'report_problem',
            color: 'error',
            filled: true,
            // F1Whisper fork: say why an upload failed (known only until the next restart).
            title: getUploadFailureTitle(status, t),
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
    // F1Whisper fork: the server is busy or unreachable and the upload is being retried.
    if (status.uploadIssue?.kind === 'waiting') {
        return {
            icon: 'schedule',
            filled: true,
            title: t(
                'messaging.hint--upload-waiting',
                'Waiting for the server, will retry the upload',
            ),
        };
    }

    return {
        icon: 'file_upload',
        filled: true,
    };
}

/**
 * F1Whisper fork: the explanation for a terminally failed upload, if its reason is still known.
 */
function getUploadFailureTitle(
    status: IndicatorProps['status'],
    t: I18nType['t'],
): string | undefined {
    const issue = status.uploadIssue;
    if (issue?.kind !== 'failed') {
        return undefined;
    }
    switch (issue.reason) {
        case 'too-slow':
            return t(
                'messaging.error--upload-too-slow',
                'The upload took too long for this connection',
            );
        case 'too-large':
            return t('messaging.error--send-file-file-too-large', 'File is too big');
        case 'storage-full':
            return t(
                'messaging.error--upload-storage-full',
                'The server cannot accept files right now',
            );
        case 'failed':
            return t('messaging.error--upload-failed', 'The file could not be uploaded');
        default:
            return unreachable(issue.reason);
    }
}

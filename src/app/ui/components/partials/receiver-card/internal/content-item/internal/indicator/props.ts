import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `Indicator` component.
 */
export interface IndicatorProps {
    /** Whether to forcefully hide status icons, even if a status is provided. */
    readonly options?: {
        /** Whether to forcefully hide status icons, even if a status is provided. */
        readonly hideStatus?: boolean;
    };
    /** Details about the conversation this status belongs to. */
    readonly conversation: {
        readonly receiver:
            | {
                  readonly type: Exclude<AnyReceiverData['type'], 'group'>;
              }
            | {
                  readonly type: 'group';
                  readonly isNotesGroup: boolean;
              };
    };
    readonly status: Status;
}

interface Status {
    readonly created: Milestone;
    readonly received?: Milestone;
    readonly sent?: Milestone;
    readonly delivered?: Milestone;
    readonly read?: Milestone;
    readonly error?: Milestone;
    readonly deleted?: Milestone;
}

interface Milestone {
    /** When the milestone was reached. */
    readonly at: Date;
}

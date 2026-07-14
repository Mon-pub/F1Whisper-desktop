/**
 * Props accepted by the `Indicator` component.
 */
export interface IndicatorProps {
    /** Direction of the message. */
    readonly direction: 'inbound' | 'outbound';
    /** Whether to forcefully hide status icons, even if a status is provided. */
    readonly options?: {
        /** Whether to forcefully hide status icons, even if a status is provided. */
        readonly hideStatus?: boolean;
        /**
         * Whether to forcefully display the reaction icons as filled, even if none of the reactions
         * is outbound.
         */
        readonly fillReactions?: boolean;

        /**
         * Whether to always show the number, even if only one reaction is there.
         */
        readonly alwaysShowNumber?: boolean;
    };
    readonly status: Status;
}

export interface Status {
    readonly created: Milestone;
    readonly received?: Milestone;
    readonly sent?: Milestone;
    readonly delivered?: Milestone;
    readonly read?: Milestone;
    readonly error?: Milestone;
    readonly deleted?: Milestone;
    readonly edited?: Milestone;
    /**
     * Per-member delivery/read receipt state for an outbound group message (F1Whisper fork), used
     * by the message-details "Read by" / "Delivered to" lists. Empty for non-group / inbound.
     */
    readonly perMemberReceipts?: readonly PerMemberReceipt[];
}

interface Milestone {
    /** When the milestone was reached. */
    readonly at: Date;
}

export interface PerMemberReceipt {
    readonly identity: string;
    readonly deliveredAt?: Date;
    readonly readAt?: Date;
}

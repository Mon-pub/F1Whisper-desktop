/**
 * An enum, followed by a statement that is neither an import nor an enum declaration, which is
 * rejected.
 */
export const enum MessageDirection {
    INBOUND = 0,
    OUTBOUND = 1,
}

export type MessageDirectionName = 'inbound' | 'outbound';

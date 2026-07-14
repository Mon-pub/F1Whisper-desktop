import type {
    CspE2eContactControlType,
    CspE2eConversationType,
    CspE2eForwardSecurityType,
    CspE2eGroupControlType,
    CspE2eGroupConversationType,
    CspE2eStatusUpdateType,
    ReceiverType,
    CspE2eGroupStatusUpdateType,
    CspE2eGroupMessageUpdateType,
    CspE2eMessageUpdateType,
    CspE2eGroupMessageReactionType,
    CspE2eMessageReactionType,
} from '~/common/enum';
import type {AnyReceiver} from '~/common/model';
import type {CspE2eType} from '~/common/network/protocol';
import type {CspMessageFlags} from '~/common/network/protocol/flags';
import type {MessageId} from '~/common/network/types';

/**
 * Message properties required to send a legacy CSP Message.
 */
export interface CommonMessageProperties<MessageType extends CspE2eType> {
    readonly type: MessageType;
    readonly cspMessageFlags: CspMessageFlags;
    readonly messageId: MessageId;
    readonly createdAt: Date;
    /**
     * Whether the profile (nickname and profile picture) may be shared with the recipient of this
     * outgoing message. There are other criteria to whether or not and how the profile picture is
     * shared, which are outlined by the `profile picture distribution steps`.
     */
    readonly allowUserProfileDistribution: boolean;
    readonly overrideReflectedProperty?: boolean;
}

/**
 * Messages that are sent to all group members.
 */
type ValidGroupMessages =
    | CspE2eGroupConversationType
    | CspE2eGroupStatusUpdateType
    | CspE2eGroupMessageUpdateType
    | CspE2eGroupMessageReactionType
    // Note: GROUP_SYNC_REQUEST is excluded, because it is only sent to the creator, not to all members
    | Exclude<CspE2eGroupControlType, CspE2eGroupControlType.GROUP_SYNC_REQUEST>;

/**
 * Messages that are sent to single contacts.
 */
type ValidContactMessages =
    | CspE2eConversationType
    | CspE2eStatusUpdateType
    | CspE2eContactControlType
    | CspE2eMessageUpdateType
    | CspE2eMessageReactionType
    // Note: GROUP_CALL_START is always sent to the whole group, not to a single contact
    | Exclude<CspE2eGroupControlType, CspE2eGroupControlType.GROUP_CALL_START>
    // F1Whisper fork: a group delivery/read receipt (0x81, carrying group context in its body) is
    // sent POINT-TO-POINT to the original message's sender only (privacy: the rest of the group must
    // not learn who delivered/read a message), so it must be addressable to a single contact.
    | CspE2eGroupStatusUpdateType.GROUP_DELIVERY_RECEIPT
    | CspE2eForwardSecurityType;

/**
 * All valid {@link CspE2eType} types that may be sent for a specific receiver.
 *
 * {@link DistributionList}s are treated the same as {@link Contact}s.
 */
export type ValidCspMessageTypeForReceiver<TReceiver extends AnyReceiver> = {
    [ReceiverType.CONTACT]: ValidContactMessages;
    [ReceiverType.GROUP]: ValidGroupMessages;
    [ReceiverType.DISTRIBUTION_LIST]: never; // TODO(DESK-237)
}[TReceiver['type']];

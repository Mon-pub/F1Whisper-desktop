import {CspE2eDeliveryReceiptStatus, CspE2eGroupStatusUpdateType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Contact} from '~/common/model';
import {CspMessageFlags} from '~/common/network/protocol/flags';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type ActiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {OutgoingCspMessagesTask} from '~/common/network/protocol/task/csp/outgoing-csp-messages';
import {randomMessageId} from '~/common/network/protocol/utils';
import * as structbuf from '~/common/network/structbuf';
import type {GroupId, IdentityString, MessageId} from '~/common/network/types';
import {chunk} from '~/common/utils/array';
import {UTF8} from '~/common/utils/codec';

/**
 * F1Whisper fork: send a GROUP delivery/read receipt (CSP 0x81 GROUP_DELIVERY_RECEIPT) POINT-TO-POINT
 * to the ORIGINAL MESSAGE'S SENDER ONLY.
 *
 * Privacy-critical: unlike the broadcast {@link OutgoingDeliveryReceiptTask} group path, this sends
 * the receipt to a single contact (the message author), so the rest of the group never learns who
 * delivered/read a message. The wire body still carries the group context (creator + group id) in a
 * `GroupMemberContainer`, exactly like the Android fork. The transport recipient is one contact.
 */
export class OutgoingGroupReceiptToSenderTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        /** The single recipient: the original group message's sender. */
        private readonly _sender: Contact,
        /** Group context carried in the receipt body. */
        private readonly _group: {
            readonly groupId: GroupId;
            readonly creatorIdentity: IdentityString;
        },
        private readonly _status:
            | CspE2eDeliveryReceiptStatus.RECEIVED
            | CspE2eDeliveryReceiptStatus.READ,
        private readonly _createdAt: Date,
        private readonly _messageIds: readonly MessageId[],
    ) {
        this._log = _services.logging.logger(`network.protocol.task.out-group-receipt-to-sender`);
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        for (const messageIds of chunk([...this._messageIds], 512)) {
            this._log.info(
                `Sending group ${this._status === CspE2eDeliveryReceiptStatus.READ ? 'READ' : 'RECEIVED'} receipt for ${messageIds.length} message(s) to sender ${this._sender.view.identity} only`,
            );
            await new OutgoingCspMessagesTask(this._services, [
                {
                    // Single-contact recipient = the message sender. NOT the group (no broadcast).
                    receiver: {main: this._sender},
                    sharedMessageProperties: {
                        messageId: randomMessageId(this._services.crypto),
                        createdAt: this._createdAt,
                        allowUserProfileDistribution: false,
                    },
                    specifics: {
                        default: {
                            encoder: structbuf.bridge.encoder(
                                structbuf.csp.e2e.GroupMemberContainer,
                                {
                                    groupId: this._group.groupId,
                                    creatorIdentity: UTF8.encode(this._group.creatorIdentity),
                                    innerData: structbuf.bridge.encoder(
                                        structbuf.csp.e2e.DeliveryReceipt,
                                        {
                                            messageIds: [...messageIds],
                                            status: this._status,
                                        },
                                    ),
                                },
                            ),
                            messageProperties: {
                                type: CspE2eGroupStatusUpdateType.GROUP_DELIVERY_RECEIPT,
                                cspMessageFlags: CspMessageFlags.none(),
                            },
                        },
                    },
                },
            ]).run(handle);
        }
    }
}

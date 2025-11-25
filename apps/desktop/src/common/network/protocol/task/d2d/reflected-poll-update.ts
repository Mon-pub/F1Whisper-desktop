import type {DbPollVoteFragment} from '~/common/db';
import type {
    IInboundPollMessageModelStore,
    IOutboundPollMessageModelStore,
} from '~/common/model/types/message/poll';
import type {PassiveTaskCodecHandle, ServicesForTasks} from '~/common/network/protocol/task';
import {PollUpdateTask} from '~/common/network/protocol/task/common/poll-update';
import type {
    ConversationId,
    DistributionListConversationId,
    IdentityString,
} from '~/common/network/types';

export class ReflectedPollUpdateTask extends PollUpdateTask<PassiveTaskCodecHandle> {
    public constructor(
        services: ServicesForTasks,
        conversationId: Exclude<ConversationId, DistributionListConversationId>,
        pollUpdateData: DbPollVoteFragment,
        senderIdentity: IdentityString,
    ) {
        const log = services.logging.logger(`network.protocol.task.reflected-poll-update`);
        super(log, services, conversationId, pollUpdateData, senderIdentity);
    }

    protected override _pollVote(
        handle: PassiveTaskCodecHandle,
        message: IInboundPollMessageModelStore | IOutboundPollMessageModelStore,
        pollUpdateData: DbPollVoteFragment,
        senderIdentity: IdentityString,
    ): void {
        message.get().controller.pollVote.fromSync(handle, pollUpdateData, senderIdentity);
    }
}

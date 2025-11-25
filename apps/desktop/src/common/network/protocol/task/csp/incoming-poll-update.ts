import type {DbPollVoteFragment} from '~/common/db';
import type {
    IInboundPollMessageModelStore,
    IOutboundPollMessageModelStore,
} from '~/common/model/types/message/poll';
import type {ActiveTaskCodecHandle, ServicesForTasks} from '~/common/network/protocol/task';
import {PollUpdateTask} from '~/common/network/protocol/task/common/poll-update';
import type {
    ConversationId,
    DistributionListConversationId,
    IdentityString,
} from '~/common/network/types';
import {assertUnreachable} from '~/common/utils/assert';

export class IncomingPollUpdateTask extends PollUpdateTask<ActiveTaskCodecHandle<'volatile'>> {
    public constructor(
        services: ServicesForTasks,
        conversationId: Exclude<ConversationId, DistributionListConversationId>,
        pollUpdateData: DbPollVoteFragment,
        senderIdentity: IdentityString,
    ) {
        const log = services.logging.logger(`network.protocol.task.incoming-poll-update`);
        super(log, services, conversationId, pollUpdateData, senderIdentity);
    }

    protected override _pollVote(
        handle: ActiveTaskCodecHandle<'volatile'>,
        message: IInboundPollMessageModelStore | IOutboundPollMessageModelStore,
        pollUpdateData: DbPollVoteFragment,
        senderIdentity: IdentityString,
    ): void {
        message
            .get()
            .controller.pollVote.fromRemote(handle, pollUpdateData, senderIdentity)
            .catch(assertUnreachable);
    }
}

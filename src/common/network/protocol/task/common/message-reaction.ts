import {MessageReaction, MessageType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {AnyNonDeletedMessageModelStore} from '~/common/model/types/message';
import type * as protobuf from '~/common/network/protobuf';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    PassiveTaskCodecHandle,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import {getConversationById} from '~/common/network/protocol/task/message-processing-helpers';
import type {
    ConversationId,
    DistributionListConversationId,
    EmojiReaction,
    IdentityString,
} from '~/common/network/types';
import {tag} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import {THUMBS_DOWN_EMOJIS, THUMBS_UP_EMOJIS} from '~/common/utils/emoji';

const EMOJIS_MAPPED_TO_LEGACY_ACKNOWLEDGE = new Set([...THUMBS_UP_EMOJIS].map(tag<EmojiReaction>));
const EMOJIS_MAPPED_TO_LEGACY_DECLINE = new Set([...THUMBS_DOWN_EMOJIS].map(tag<EmojiReaction>));

export abstract class MessageReactionTask<
    TTaskCodecHandleType extends PassiveTaskCodecHandle | ActiveTaskCodecHandle<'volatile'>,
> implements ComposableTask<TTaskCodecHandleType, void>
{
    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _conversationId: Exclude<ConversationId, DistributionListConversationId>,
        private readonly _reactionMessage: protobuf.validate.csp_e2e.Reaction.Type,
        protected readonly _createdAt: Date,
        protected readonly _senderIdentity: IdentityString,
        private readonly _log: Logger,
    ) {}

    // eslint-disable-next-line @typescript-eslint/require-await
    public async run(handle: TTaskCodecHandleType): Promise<void> {
        const conversation = getConversationById(this._services, this._conversationId);

        if (conversation === undefined) {
            this._log.debug(
                'Discarding emoji reaction because the associated conversation was not found',
            );
            return;
        }

        const messageModelStore = conversation
            .get()
            .controller.getMessage(this._reactionMessage.messageId);

        if (messageModelStore === undefined) {
            this._log.debug(
                'Discarding emoji reaction because the associated message was not found',
            );
            return;
        }

        if (messageModelStore.type === MessageType.DELETED) {
            this._log.debug(
                'Discarding emoji reaction because the associated message was of type DELETED',
            );
            return;
        }

        switch (this._reactionMessage.action) {
            case 'apply': {
                if (this._reactionMessage.apply === '') {
                    this._log.debug(
                        'Discarding emoji reaction because the associated string was empty',
                    );
                    return;
                }
                this._apply(handle, messageModelStore, this._reactionMessage.apply);
                break;
            }

            case 'withdraw': {
                if (this._reactionMessage.widthdraw === '') {
                    this._log.debug(
                        'Discarding emoji reaction because the associated string was empty',
                    );
                    return;
                }
                this._withdraw(handle, messageModelStore, this._reactionMessage.withdraw);
                break;
            }
            default:
                unreachable(this._reactionMessage);
        }
    }

    protected abstract _apply(
        handle: TTaskCodecHandleType,
        messageModelStore: AnyNonDeletedMessageModelStore,
        emojiReaction: EmojiReaction,
    ): void;
    protected abstract _withdraw(
        handle: TTaskCodecHandleType,
        messageModelStore: AnyNonDeletedMessageModelStore,
        emojiReaction: EmojiReaction,
    ): void;
}

export function legacyReactionMappingSteps(
    emojiReaction: EmojiReaction,
): MessageReaction | undefined {
    if (EMOJIS_MAPPED_TO_LEGACY_ACKNOWLEDGE.has(emojiReaction)) {
        return MessageReaction.ACKNOWLEDGE;
    }
    if (EMOJIS_MAPPED_TO_LEGACY_DECLINE.has(emojiReaction)) {
        return MessageReaction.DECLINE;
    }

    return undefined;
}

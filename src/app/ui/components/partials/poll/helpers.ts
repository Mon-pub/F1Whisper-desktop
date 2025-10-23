import type {ProfilePictureReceiverData} from '~/app/ui/components/partials/profile-picture-button/props';
import {PollDisplayMode} from '~/common/enum';
import type {IdentityString} from '~/common/network/types';
import type {i53, u53} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import type {PollData} from '~/common/viewmodel/conversation/main/message/regular-message/store/types';
import type {AnyReceiverData, SelfReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Returns true if the given receiver allows for the user to interact (close, vote) with polls.
 */
export function receiverAllowsPollInteraction(receiver: AnyReceiverData): boolean {
    return !(
        (receiver.type === 'contact' && receiver.isBlocked) ||
        (receiver.type === 'group' && receiver.isLeft)
    );
}

/**
 * Filter all receivers whose identities are included in senderIdentities.
 */
export function getParticipants(
    receiver: AnyReceiverData,
    selfReceiverData: SelfReceiverData,
    senderIdentities: IdentityString[],
): ProfilePictureReceiverData[] {
    switch (receiver.type) {
        case 'contact':
            return [receiver, selfReceiverData].filter((m) =>
                senderIdentities.includes(m.identity),
            );

        case 'group':
            return receiver.members
                .concat(receiver.creator)
                .filter((m) => senderIdentities.includes(m.identity));

        case 'distribution-list':
            // TODO(DESK-236): Implement distribution lists.
            return [];

        default:
            return unreachable(receiver);
    }
}

/**
 * Sort the choices in descending order based on the total number of votes (if available) or the
 * number of selected votes.
 */
export function sortChoicesByVotes(
    displayMode: PollDisplayMode,
    choices: PollData['choices'],
): {
    readonly description: PollData['choices'][u53]['description'];
    readonly selectedVotes: PollData['choices'][u53]['votes'];
    readonly numVotes: u53;
    readonly choiceId: i53;
}[] {
    return choices
        .map((choice) => {
            const selectedVotes = choice.votes.filter((v) => v.selected);
            return {
                description: choice.description,
                selectedVotes,
                numVotes:
                    displayMode === PollDisplayMode.SUMMARY
                        ? (choice.totalAmountVotes ?? 0)
                        : selectedVotes.length,
                choiceId: choice.choiceId,
            };
        })
        .sort((a, b) => b.numVotes - a.numVotes);
}

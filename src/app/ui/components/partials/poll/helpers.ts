import type {ProfilePictureReceiverData} from '~/app/ui/components/partials/profile-picture-button/props';
import {PollDisplayMode} from '~/common/enum';
import type {IdentityString} from '~/common/network/types';
import {unreachable} from '~/common/utils/assert';
import type {PollData} from '~/common/viewmodel/conversation/main/message/regular-message/store/types';
import type {AnyReceiverData, SelfReceiverData} from '~/common/viewmodel/utils/receiver';

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
    displayMode: PollData['displayMode'],
    choices: PollData['choices'],
): PollData['choices'] {
    return choices.sort(
        (a, b) =>
            (displayMode === PollDisplayMode.SUMMARY
                ? (b.totalAmountVotes ?? 0)
                : b.votes.filter((v) => v.selected).length) -
            (displayMode === PollDisplayMode.SUMMARY
                ? (a.totalAmountVotes ?? 0)
                : a.votes.filter((v) => v.selected).length),
    );
}

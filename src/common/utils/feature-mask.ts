import type {ServicesForBackend} from '~/common/backend';
import {ReceiverType} from '~/common/enum';
import type {Conversation} from '~/common/model';
import {FEATURE_MASK_FLAG, type FeatureMask} from '~/common/network/types';
import {unreachable} from '~/common/utils/assert';
import {isGroupManagedAndMonitoredByGateway, isGroupManagedByGateway} from '~/common/utils/group';

export function checkFeatureMaskSupportsFeature(
    featureMask: FeatureMask,
    feature: keyof typeof FEATURE_MASK_FLAG,
): boolean {
    // eslint-disable-next-line no-bitwise
    return (featureMask & FEATURE_MASK_FLAG[feature]) !== 0x00n;
}

/**
 * Check whether contacts in this conversation support a given feature.
 *
 * The return value can be:
 *
 * - All contacts support the feature
 * - No contacts support the feature
 * - Some contacts support the feature
 *
 * If only some contacts support the feature, the return value includes the display names of the
 * contacts that don't support this feature yet.
 */
export function supportsFeature(
    conversation: Conversation,
    services: Pick<ServicesForBackend, 'device' | 'logging' | 'model'>,
    feature: keyof typeof FEATURE_MASK_FLAG,
):
    | {readonly supported: 'none' | 'all'}
    | {readonly supported: 'partial'; readonly notSupportedNames: readonly string[]} {
    const {logging, model} = services;
    const log = logging.logger('viewmodel.conversation.supportsEditMessage');

    // Display names of contacts that don't support message the feature.
    const notSupportedNames: string[] = [];

    const receiver = conversation.controller.receiver();
    switch (receiver.type) {
        case ReceiverType.CONTACT: {
            // Check whether contact supports the feature.
            const featureMask = receiver.get().view.featureMask;
            return {
                supported: checkFeatureMaskSupportsFeature(featureMask, feature) ? 'all' : 'none',
            };
        }
        case ReceiverType.GROUP: {
            // Check whether group members support the feature.
            //
            // Note: The list of members does not include the group creator, nor does it
            // include the user.
            const memberIdentities = [...receiver.get().view.members].map(
                (member) => member.get().view.identity,
            );
            for (const identity of memberIdentities) {
                const member = model.contacts.getByIdentity(identity)?.get();
                if (member === undefined) {
                    log.error(`Could not find group member contact for identity ${identity}`);
                    continue;
                }
                if (!checkFeatureMaskSupportsFeature(member.view.featureMask, feature)) {
                    notSupportedNames.push(member.view.displayName);
                }
            }

            const creator = receiver.get().view.creator;
            if (creator !== 'me') {
                // The user is not the creator, hence we need to check the creator's feature mask as well.
                // If the creator is a Gateway ID that is not monitored, don't show it in the list.
                const creatorIdentity = creator.get().view.identity;
                if (
                    !(
                        isGroupManagedByGateway(creatorIdentity) &&
                        !isGroupManagedAndMonitoredByGateway(
                            receiver.get().view.displayName,
                            creatorIdentity,
                        )
                    ) &&
                    !checkFeatureMaskSupportsFeature(creator.get().view.featureMask, feature)
                ) {
                    notSupportedNames.push(creator.get().view.displayName);
                }
            }

            if (
                (creator === 'me' && notSupportedNames.length === memberIdentities.length) ||
                (creator !== 'me' && notSupportedNames.length === memberIdentities.length + 1)
            ) {
                return {supported: 'none'};
            } else if (notSupportedNames.length === 0) {
                return {supported: 'all'};
            }
            return {supported: 'partial', notSupportedNames};
        }
        case ReceiverType.DISTRIBUTION_LIST:
            // TODO(DESK-771) Distribution lists
            return {supported: 'none'};
        default:
            return unreachable(receiver);
    }
}

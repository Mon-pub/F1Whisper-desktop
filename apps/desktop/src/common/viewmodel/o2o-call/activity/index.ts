import type {
    OngoingO2oCall,
    OngoingO2oCallContext,
    OngoingO2oCallController,
    O2oCallState,
} from '~/common/model/o2o-call';
import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {LocalStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import type {ServicesForViewModel} from '~/common/viewmodel';
import {getContactReceiverData, type ContactReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * View model of an ongoing 1:1 call's state, enriched with the peer's receiver data for display.
 *
 * `peer` is `undefined` in the (unexpected) case that the peer contact no longer exists (e.g. it
 * was deleted while the call was ongoing) -- the UI should treat this the same as a call that's
 * about to end.
 */
export interface OngoingO2oCallStateViewModel {
    readonly call: O2oCallState;
    readonly peer: ContactReceiverData | undefined;
}

export interface OngoingO2oCallViewModelBundle extends PropertiesMarked {
    readonly context: OngoingO2oCallContext;
    readonly controller: OngoingO2oCallController;
    readonly state: LocalStore<OngoingO2oCallStateViewModel>;
}

/**
 * Build the view model bundle for an ongoing 1:1 call. Mirrors
 * `getOngoingGroupCallViewModelBundle`, but much simpler: a single peer contact instead of a
 * participant list.
 */
export function getOngoingO2oCallViewModelBundle(
    services: Pick<ServicesForViewModel, 'device' | 'endpoint' | 'model'>,
    ongoing: OngoingO2oCall,
): OngoingO2oCallViewModelBundle {
    const controller = ongoing.get().controller;
    const peerIdentity = ongoing.ctx.peerIdentity;
    const state = derive([ongoing], ([{currentValue: call}], getAndSubscribe) => {
        const peerContact = services.model.contacts.getByIdentity(peerIdentity);
        return {
            call: call.view,
            peer:
                peerContact === undefined
                    ? undefined
                    : getContactReceiverData(services, peerContact.get(), getAndSubscribe),
        };
    });
    return services.endpoint.exposeProperties({context: ongoing.ctx, controller, state});
}

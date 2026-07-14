import type {AppServicesForSvelte} from '~/app/types';
import type {Remote} from '~/common/utils/endpoint';
import type {OngoingO2oCallViewModelBundle} from '~/common/viewmodel/o2o-call/activity';

/**
 * Props accepted by the `O2oCallActivity` component (the in-call screen for a 1:1 audio call).
 */
export interface O2oCallActivityProps {
    /**
     * The ongoing 1:1 call view model bundle to render. Mirrors how `GroupCallActivity` receives an
     * `AugmentedOngoingGroupCallViewModelBundle`, but the o2o bundle is much simpler (a single peer,
     * audio-only, no participant feeds).
     */
    readonly call: Remote<OngoingO2oCallViewModelBundle>;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}

/**
 * Props accepted by the `IncomingCallO2o` overlay component (the incoming-call ring surface).
 */
export interface IncomingCallO2oProps {
    /**
     * The ongoing 1:1 call view model bundle, expected to be in the `ringing-in` state. The overlay
     * subscribes to `call.state` and dismisses itself once the state leaves `ringing-in`.
     */
    readonly call: Remote<OngoingO2oCallViewModelBundle>;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}

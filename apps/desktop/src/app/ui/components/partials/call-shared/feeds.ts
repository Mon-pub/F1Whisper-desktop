import type {u53} from '@threema/ts-utils/integer/u53';

import type {
    FeedType,
    ParticipantFeedProps,
} from '~/app/ui/components/partials/call-participant-feed/props';
import type {CallActivityFeeds} from '~/app/ui/components/partials/call-shared/call-audio-controller';
import type {CaptureDevices} from '~/app/ui/components/partials/call-shared/helpers';
import type {AugmentedRemoteParticipantStateViewModel} from '~/app/ui/components/partials/call-shared/transformer';
import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
import type {ParticipantId} from '~/common/network/protocol/call/group-call';
import type {Dimensions} from '~/common/types';
import type {GroupCallParticipantReceiverData} from '~/common/viewmodel/utils/call';
import type {SelfReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * A single feed's props as consumed by the activity components: a {@link ParticipantFeedProps}
 * without the per-component `activity` and `services` props (which the hosting component adds).
 */
export type FeedProps<TType extends FeedType> = Omit<
    ParticipantFeedProps<TType>,
    'activity' | 'services'
>;

/**
 * Callback which (un)subscribes a participant's camera or screen feed. Matches the debouncers
 * returned by {@link createCallMediaHandlers}.
 */
type UpdateSubscription = (
    dimensions: Dimensions | undefined,
    participantId: 'local' | ParticipantId,
) => void;

/**
 * Build the local participant's camera feed props.
 *
 * `decorateReceiver` lets the conference variant mark the local participant as moderator. It is a
 * closure (not a plain value) so its reactive reads stay in the hosting component's derived.
 */
export function buildLocalFeed(args: {
    readonly user: SelfReceiverData;
    readonly localDevices: CaptureDevices;
    readonly container: SvelteNullableBinding<HTMLElement>;
    readonly updateCameraSubscription: UpdateSubscription;
    readonly updateScreenSubscription: UpdateSubscription;
    readonly decorateReceiver?: (receiver: SelfReceiverData) => GroupCallParticipantReceiverData;
}): FeedProps<'localVideo'> {
    const {
        user,
        localDevices,
        container,
        updateCameraSubscription,
        updateScreenSubscription,
        decorateReceiver,
    } = args;

    return {
        id: 'localVideo_local',
        type: 'localVideo',
        capture: {
            camera: {state: localDevices.camera?.state ?? 'off'},
            microphone: {state: localDevices.microphone?.state ?? 'off'},
            screen: {state: localDevices.screen?.state ?? 'off'},
        },
        container,
        updateCameraSubscription: (dimensions) => updateCameraSubscription(dimensions, 'local'),
        updateScreenSubscription: (dimensions) => {
            updateScreenSubscription(dimensions, 'local');
        },
        participantId: 'local',
        receiver: decorateReceiver?.(user) ?? user,
        tracks: {
            type: 'localVideo',
            camera: localDevices.camera?.track,
        },
    };
}

/**
 * Build the local participant's screen-share feed props, or `undefined` while the screen is not
 * being shared.
 */
export function buildLocalScreen(args: {
    readonly user: SelfReceiverData;
    readonly localDevices: CaptureDevices;
    readonly container: SvelteNullableBinding<HTMLElement>;
    readonly updateCameraSubscription: UpdateSubscription;
    readonly updateScreenSubscription: UpdateSubscription;
}): FeedProps<'localScreen'> | undefined {
    const {user, localDevices, container, updateCameraSubscription, updateScreenSubscription} =
        args;

    const screen = localDevices.screen;
    if (screen === undefined || screen.state !== 'on') {
        return undefined;
    }

    return {
        id: 'localScreen_local',
        type: 'localScreen',
        capture: {
            camera: {state: localDevices.camera?.state ?? 'off'},
            microphone: {state: localDevices.microphone?.state ?? 'off'},
            screen: {state: screen.state},
        },
        container,
        updateCameraSubscription: (dimensions) => updateCameraSubscription(dimensions, 'local'),
        updateScreenSubscription: (dimensions) => {
            updateScreenSubscription(dimensions, 'local');
        },
        participantId: 'local',
        receiver: user,
        tracks: {
            type: 'localScreen',
            screen: screen.track,
        },
    };
}

/**
 * Build the remote participants' feed props: a camera feed for each participant plus a screen feed
 * for any participant currently sharing their screen.
 */
export function buildRemoteFeeds(
    remote: readonly AugmentedRemoteParticipantStateViewModel[],
    deps: {
        readonly container: SvelteNullableBinding<HTMLElement>;
        readonly updateCameraSubscription: UpdateSubscription;
        readonly updateScreenSubscription: UpdateSubscription;
    },
): readonly FeedProps<'remoteVideo' | 'remoteScreen'>[] {
    const {container, updateCameraSubscription, updateScreenSubscription} = deps;

    return remote.flatMap((participant): FeedProps<'remoteVideo' | 'remoteScreen'>[] => {
        const res: FeedProps<'remoteVideo' | 'remoteScreen'>[] = [
            {
                id: `remoteVideo_${participant.id}`,
                type: 'remoteVideo',
                capture: participant.capture,
                container,
                updateCameraSubscription: (dimensions) =>
                    updateCameraSubscription(dimensions, participant.id),
                updateScreenSubscription: (dimension) =>
                    updateScreenSubscription(dimension, participant.id),
                participantId: participant.id,
                receiver: participant.receiver,
                tracks: {
                    type: 'remoteVideo',
                    microphone: participant.transceivers.microphone.receiver.track,
                    camera: participant.transceivers.camera.receiver.track,
                },
            },
        ];

        if (participant.capture.screen.state === 'on') {
            res.push({
                id: `remoteScreen_${participant.id}`,
                type: 'remoteScreen',
                capture: participant.capture,
                container,
                updateCameraSubscription: (dimensions) =>
                    updateCameraSubscription(dimensions, participant.id),
                updateScreenSubscription: (dimension) =>
                    updateScreenSubscription(dimension, participant.id),
                participantId: participant.id,
                receiver: participant.receiver,
                tracks: {
                    type: 'remoteScreen',
                    screen: participant.transceivers.screen.receiver.track,
                },
            });
        }

        return res;
    });
}

/**
 * Sort feeds by display priority: local screen share first, then remote screen shares, then the
 * local camera, then remote cameras.
 */
export function sortFeeds(feeds: CallActivityFeeds): CallActivityFeeds {
    const priority: Record<FeedType, u53> = {
        localScreen: 0,
        remoteScreen: 1,
        localVideo: 2,
        remoteVideo: 4,
    };

    return [...feeds].sort((a, b) => priority[a.type] - priority[b.type]);
}

import type {AppServicesForSvelte} from '~/app/types';
import type {ActivityLayout} from '~/app/ui/components/partials/call-activity/helpers';
import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
import type {ParticipantId} from '~/common/network/protocol/call/group-call';
import type {Dimensions} from '~/common/types';
import type {GroupCallParticipantReceiverData} from '~/common/viewmodel/utils/call';
import type {AugmentedCaptureState, CaptureState} from '~/common/webrtc/group-call';

export interface ParticipantFeedProps<TType extends FeedType> {
    /**
     * Details about the `activity` this feed is part of.
     */
    readonly activity: {
        readonly layout: ActivityLayout;
    };
    readonly capture: TType extends 'remoteScreen' ? AugmentedCaptureState : CaptureState;
    /**
     * Reference to the (scroll-)container element this `ParticipantFeed` is part of.
     */
    readonly container: SvelteNullableBinding<HTMLElement>;
    /**
     * Indicates whether this `ParticipantFeed` is currently displayed in full view. Defaults fo
     * `false`.
     */
    readonly isFullView?: boolean;
    readonly onclick?: (event: MouseEvent | KeyboardEvent) => void;
    readonly onclicktogglefullview?: (event: MouseEvent) => void;
    /**
     * Callback which is called when the camera feed should be subscribed.
     *
     * It should be called when:
     *
     * - the video element to render the camera feed is removed/added,
     * - the video element to render the camera feed disappears from or reappears in the viewport.
     *
     * @param dimensions the viewport Dimensions or `undefined` if not in the viewport or no video
     *   should be shown
     */
    readonly updateCameraSubscription: (dimensions: Dimensions | undefined) => void;
    readonly updateScreenSubscription: (dimensions: Dimensions | undefined) => void;
    readonly id: string;
    readonly participantId: TType extends 'localVideo' | 'localScreen' ? 'local' : ParticipantId;
    readonly receiver: GroupCallParticipantReceiverData;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
    readonly tracks: TType extends 'localVideo'
        ? {
              readonly type: TType;
              readonly camera: MediaStreamTrack | undefined;
          }
        : TType extends 'remoteVideo'
          ? {
                readonly type: TType;
                readonly microphone: MediaStreamTrack;
                readonly camera: MediaStreamTrack;
            }
          : {
                readonly type: TType;
                readonly screen: MediaStreamTrack;
            };
    readonly type: TType;
}

export const videoFeedTypes = ['localVideo', 'remoteVideo'] as const;
export type VideoFeedType = (typeof videoFeedTypes)[number];
export const screenFeedTypes = ['localScreen', 'remoteScreen'] as const;
export type ScreenFeedType = (typeof screenFeedTypes)[number];

export type FeedType = VideoFeedType | ScreenFeedType;

export function isVideoFeedType(v: unknown): v is VideoFeedType {
    return typeof v === 'string' && videoFeedTypes.includes(v as VideoFeedType);
}

export function isScreenFeedType(v: unknown): v is ScreenFeedType {
    return typeof v === 'string' && screenFeedTypes.includes(v as ScreenFeedType);
}

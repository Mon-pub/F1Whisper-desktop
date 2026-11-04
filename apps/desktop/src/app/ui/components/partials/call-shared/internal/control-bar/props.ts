import type {
    AudioInputDeviceInfo,
    AudioOutputDeviceInfo,
    VideoDeviceInfo,
} from '~/app/ui/components/partials/call-shared/internal/control-bar/types';

/**
 * Props accepted by the `ControlBar` component.
 */
export interface ControlBarProps {
    /**
     * The `deviceId` of the currently active audio input device.
     */
    readonly currentAudioInputDeviceId: string | undefined;
    /**
     * The `deviceId` of the currently active audio output device.
     */
    readonly currentAudioOutputDeviceId: string | undefined;
    /**
     * The `deviceId` of the currently active video device.
     */
    readonly currentVideoDeviceId: string | undefined;
    /**
     * The label of the last selected camera (persisted in settings). Used to mark the selected
     * camera in the device menu while the camera is off (and thus has no active device).
     */
    readonly lastSelectedVideoDeviceLabel: string | undefined;
    /**
     * Whether the user is actively sharing audio with the other call participants.
     */
    readonly isAudioEnabled: boolean;
    /**
     * Whether the user is actively sharing video with the other call participants.
     */
    readonly isVideoEnabled: boolean;
    /**
     * Whether the user is actively sharing his screen with the other call participants.
     */
    readonly isScreenSharingEnabled: boolean;
    readonly onclickleavecall: (event: MouseEvent) => void;
    readonly onclicktoggleaudio: (event: MouseEvent) => void;
    readonly onclicktogglevideo: (event: MouseEvent) => void;
    readonly onclicktogglescreensharing: (event: MouseEvent) => void;
    /**
     * Handler callback which is invoked when a different audio input device is selected than that
     * which is currently active.
     */
    readonly onselectaudioinputdevice: (device: AudioInputDeviceInfo) => void;
    /**
     * Handler callback which is invoked when a different audio output device is selected than that
     * which is currently active.
     */
    readonly onselectaudiooutputdevice: (device: AudioOutputDeviceInfo) => void;
    /**
     * Handler callback which is invoked when a different video device is selected than that which
     * is currently active.
     */
    readonly onselectvideodevice: (device: VideoDeviceInfo) => void;
    readonly options?: {
        /**
         * Whether users should see an option to share their screen. Defaults to `false`.
         */
        readonly allowScreenSharing?: boolean;
    };
    /**
     * In-call invite sharing.
     */
    readonly invite?: {
        /**
         * Handler callback which is invoked when the user chooses to copy the invite link to the
         * clipboard.
         */
        readonly onclickcopy: () => void;
        /**
         * Handler callback which is invoked when the user chooses to share the invite.
         */
        readonly onclickshare: () => void;
    };
}

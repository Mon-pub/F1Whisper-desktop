import {AsyncLock} from '@threema/ts-utils/lock/async-lock';
import {TIMER} from '@threema/ts-utils/timer/global-timer';

import type {AppServicesForSvelte} from '~/app/types';
import {
    type AnyAugmentedOngoingCallViewModelBundle,
    type AnyExtendedGroupCallContextAbort,
    type CaptureDevices,
    type CaptureDevicesGuard,
    attachLocalDeviceAndAnnounceCaptureState,
    createCaptureDevices,
    findMediaDevice,
    selectCameraDevice,
    selectInitialCaptureDevices,
    selectMicrophoneDevice,
    startScreenSharing,
    updateRemoteParticipantRemoteCameras,
    updateRemoteParticipantScreens,
} from '~/app/ui/components/partials/call-shared/helpers';
import type {
    AudioInputDeviceInfo,
    AudioOutputDeviceInfo,
    VideoDeviceInfo,
} from '~/app/ui/components/partials/call-shared/internal/control-bar/types';
import type {i18n as i18nStore} from '~/app/ui/i18n';
import {toast} from '~/app/ui/snackbar';
import type {ElectronIpcService} from '~/common/dom/electron-service';
import type {Logger} from '~/common/logging';
import type {ParticipantId} from '~/common/network/protocol/call/group-call';
import type {Dimensions} from '~/common/types';
import {assertUnreachable} from '~/common/utils/assert';
import type {AbortRaiser} from '~/common/utils/signal';
import type {ReadableStore} from '~/common/utils/store';

/**
 * Everything the media handlers need from the hosting activity component.
 */
export interface CallMediaHandlersContext {
    readonly services: AppServicesForSvelte;
    readonly log: Logger;
    readonly electron: ElectronIpcService;
    readonly i18n: typeof i18nStore;
    /**
     * Must return the currently active call of the hosting activity component.
     */
    readonly getCall: () => AnyAugmentedOngoingCallViewModelBundle | undefined;
    /**
     * Must return the {@link AbortRaiser} for the currently active call of the hosting activity
     * component.
     */
    readonly getStop: () => AbortRaiser<AnyExtendedGroupCallContextAbort> | undefined;
    readonly setAudioSink: (deviceId: string | undefined) => void;
}

export type CallMediaHandlers = ReturnType<typeof createCallMediaHandlers>;

/**
 * Create the device-control handlers for a call-activity.
 */
export function createCallMediaHandlers(ctx: CallMediaHandlersContext): {
    readonly guard: CaptureDevicesGuard;
    readonly localDevices: ReadableStore<CaptureDevices>;
    readonly selectAudioInput: (device: AudioInputDeviceInfo) => void;
    readonly selectAudioOutput: (device: AudioOutputDeviceInfo) => void;
    readonly selectVideo: (device: VideoDeviceInfo) => void;
    readonly toggleMicrophone: (state: 'on' | 'off' | 'toggle') => void;
    readonly toggleCamera: (state: 'on' | 'off' | 'toggle') => void;
    readonly toggleScreenSharing: () => void;
    readonly updateCameraSubscription: (
        dimensions: Dimensions | undefined,
        participantId: 'local' | ParticipantId,
    ) => void;
    readonly updateScreenSubscription: (
        dimensions: Dimensions | undefined,
        participantId: 'local' | ParticipantId,
    ) => void;
    readonly initializeCaptureDevices: (initial: {
        readonly microphone: boolean;
        readonly camera: boolean;
    }) => void;
    readonly stopCapture: () => void;
} {
    const {services, log, electron, i18n, getCall, getStop, setAudioSink} = ctx;

    const {guard, store: localDevices} = createCaptureDevices();

    // Serializes the local camera lifecycle operations (on/off), so that each operation's decision
    // is made against the *committed* result of the previous one.
    const cameraOperationLock = new AsyncLock();

    // The label of the camera most recently selected by the user in this session, or `undefined` if
    // none was selected yet. Tracked locally (in addition to being persisted to settings) so that a
    // device picked while the camera is off is honored immediately when it's turned on the next
    // time.
    let selectedCameraLabel: string | undefined = undefined;

    // Set once `stopCapture` has been called (i.e. the hosting activity is being torn down). Used
    // to bail out of an in-flight camera acquisition so we don't open the hardware after the call
    // is gone.
    let disposed = false;

    const updateCameraSubscription = TIMER.debounceWithDistinctArgs(
        (dimensions: Dimensions | undefined, participantId: 'local' | ParticipantId) => {
            const call = getCall();
            if (call === undefined || getStop() === undefined || participantId === 'local') {
                // If call is `undefined` (i.e., not running) or not started, there's no need to un-
                // or resubscribe the camera feed. Additionally, if it's the user's own camera feed,
                // there's no need to manage it.
                return;
            }

            // Note: `dimensions`/`participantId` originate from plain (non-reactive) values, so no
            // `$state.snapshot` unwrapping is required before sending them to the backend.
            updateRemoteParticipantRemoteCameras({
                controller: call.controller,
                participantId,
                dimensions,
            }).catch((error: unknown) => {
                log.error('Updating remote camera subscription failed', error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
        },
        500,
        // Debounce using `distinctArgs` and use the participant id as the key, so the debounced
        // function is called once for each participant.
        (_, id) => `${id}`,
        true,
    );

    const updateScreenSubscription = TIMER.debounceWithDistinctArgs(
        (dimensions: Dimensions | undefined, participantId: 'local' | ParticipantId) => {
            const call = getCall();
            if (call === undefined || getStop() === undefined || participantId === 'local') {
                return;
            }

            // Note: `dimensions`/`participantId` originate from plain (non-reactive) values, so no
            // `$state.snapshot` unwrapping is required before sending them to the backend.
            updateRemoteParticipantScreens({
                controller: call.controller,
                participantId,
                dimensions,
            }).catch((error: unknown) => {
                log.error('Updating remote screen subscription failed', error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
        },
        500,
        // Debounce using `distinctArgs` and use the participant id as the key, so the debounced
        // function is called once for each participant.
        (_, id) => `${id}`,
        true,
    );

    function selectAudioInput(device: AudioInputDeviceInfo): void {
        selectMicrophoneDevice(guard, getCall(), {
            device: {
                deviceId: device.deviceId,
            },
            state: (localDevices.get().microphone?.track.enabled ?? false) ? 'on' : 'off',
        })
            .then(async () => {
                await services.settings.update({
                    type: 'calls',
                    update: {lastSelectedMicrophone: device.label},
                });
                log.debug(`Selected microphone device "${device.label}" was saved to settings`);
            })
            .catch((error: unknown) => {
                log.error(
                    `Error selecting or saving selected microphone device ${device.label}: ${error}`,
                );
            });
    }

    function selectAudioOutput(device: AudioOutputDeviceInfo): void {
        setAudioSink(device.deviceId);
        services.settings
            .update({
                type: 'calls',
                update: {
                    lastSelectedSpeakers: device.label,
                },
            })
            .then(() => {
                log.debug(`Selected speaker device "${device.label}" was saved to settings`);
            })
            .catch((error: unknown) => {
                log.error(
                    `Error saving selected speaker device "${device.label}" to settings: ${error}`,
                );
            });
    }

    function selectVideo(device: VideoDeviceInfo): void {
        async function persistSelection(): Promise<void> {
            await services.settings.update({
                type: 'calls',
                update: {lastSelectedCamera: device.label},
            });
            log.debug(`Selected camera device "${device.label}" was saved to settings`);
        }

        // Reading the committed state inside `cameraOperationLock` ensures we don't observe stale
        // state while an acquire/release is in flight.
        cameraOperationLock
            .with(async () => {
                // Remember the selection for the next on-demand acquire (see `acquireCameraDevice`).
                selectedCameraLabel = device.label;

                // While the camera is off, the device is released, so only persist the selection.
                if (localDevices.get().camera === undefined) {
                    await persistSelection();
                    return;
                }

                // While the camera is on, switch the live device and persist the selection.
                await selectCameraDevice(guard, getCall(), {
                    device: {
                        deviceId: device.deviceId,
                    },
                    facing: 'user',
                    state: 'on',
                });
                await persistSelection();
            })
            .catch((error: unknown) => {
                log.warn(
                    `Error selecting or saving selected camera device ${device.label}: ${error}`,
                );
            });
    }

    function toggleMicrophone(state: 'on' | 'off' | 'toggle'): void {
        guard
            .with(async (store) => {
                const microphone = store.get().microphone;
                return await attachLocalDeviceAndAnnounceCaptureState(
                    guard,
                    getCall(),
                    store,
                    'microphone',
                    microphone === undefined
                        ? undefined
                        : {
                              track: microphone.track,
                              state,
                          },
                );
            }, 'attach')
            .catch((error: unknown) => {
                log.error(`Setting local microphone capture state failed`, error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
    }

    function toggleCamera(state: 'on' | 'off' | 'toggle'): void {
        // Serialize toggle operations using `cameraOperationLock` to prevent double-acquire due to
        // stale state while an acquire/release is in flight.
        cameraOperationLock
            .with(async () => {
                // The camera is considered "off" while no track is held (it is released and
                // re-acquired on demand, rather than kept open with `enabled = false`).
                const isCurrentlyOff = localDevices.get().camera === undefined;
                const turnOn = state === 'on' || (state === 'toggle' && isCurrentlyOff);

                if (turnOn) {
                    // Acquire the camera on demand.
                    await acquireCameraDevice();
                } else {
                    // Turn off by releasing the camera hardware immediately (no grace period).
                    await releaseCameraDevice();
                }
            })
            .catch((error: unknown) => {
                log.error(`Toggling local camera device failed`, error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
    }

    /**
     * Acquire the camera device.
     *
     * IMPORTANT: MUST only be called while {@link cameraOperationLock} is held, so the decision
     * whether to `acquireCameraDevice` or `releaseCameraDevice` is based on fresh state.
     */
    async function acquireCameraDevice(): Promise<void> {
        // Resolve which camera to open from its label, preferring a device explicitly selected in
        // this session over the last selected camera persisted in settings, and falling back to the
        // default device if the label is unset or the device is no longer available.
        const label = selectedCameraLabel ?? services.settings.views.calls.get().lastSelectedCamera;
        let device: 'default' | {readonly deviceId: string} = 'default';
        if (label !== undefined) {
            const mediaDevice = await findMediaDevice('videoinput', label);
            if (mediaDevice !== undefined) {
                device = {deviceId: mediaDevice.deviceId};
            }
        }

        // The hosting activity may have been torn down while we were resolving the device above.
        if (disposed) {
            return;
        }

        try {
            await selectCameraDevice(guard, getCall(), {device, facing: 'user', state: 'on'});
        } catch (error) {
            // Acquiring the camera failed (e.g. the device is busy or access was denied). Stay off
            // and inform the user with a dismissable toast, but do not abort the call.
            log.warn(`Acquiring camera device failed`, error);
            toast.addDismissable(
                i18n
                    .get()
                    .t('messaging.error--call-camera-unavailable', 'Camera could not be turned on'),
                {
                    type: 'md-icon',
                    name: 'error',
                    theme: 'Outlined',
                    color: 'red',
                },
            );
        }
    }

    /**
     * Release the camera device.
     *
     * Detaches the track from the transceiver, announces the `'off'` capture state and clears the
     * store entry, then explicitly stops the previously held track.
     *
     * IMPORTANT: MUST only be called while {@link cameraOperationLock} is held, so the decision
     * whether to `acquireCameraDevice` or `releaseCameraDevice` is based on fresh state.
     */
    async function releaseCameraDevice(): Promise<void> {
        return await guard.with(async (store) => {
            const current = store.get().camera;
            await attachLocalDeviceAndAnnounceCaptureState(
                guard,
                getCall(),
                store,
                'camera',
                undefined,
            );
            // Important: `attachLocalDeviceAndAnnounceCaptureState` does *not* stop the previous
            // track, so the explicit `stop()` is required to actually release the hardware. We
            // detach first, then stop.
            current?.track.stop();
        }, 'select-camera');
    }

    function toggleScreenSharing(): void {
        guard
            .with(async (store) => {
                const screen = store.get().screen;

                if (screen === undefined || screen.state === 'off') {
                    await startScreenSharing(
                        electron,
                        guard,
                        store,
                        getCall(),
                        i18n
                            .get()
                            .t(
                                'messaging.hint--call-screen-sharing-enabled',
                                'You are sharing your screen',
                            ),
                        i18n.get().t('messaging.label--call-screen-sharing-stop', 'Stop sharing'),
                    );

                    // Register callback to stop screen sharing.
                    electron.registerOnScreenSharingStopCallback(() => {
                        guard
                            .with(
                                (s) => s.get().screen?.track.dispatchEvent(new Event('ended')),
                                'select-screen',
                            )
                            .catch((error: unknown) => {
                                log.error(`Stopping screen sharing failed`, error);
                            });
                    });
                } else {
                    screen.track.dispatchEvent(new Event('ended'));
                }
            }, 'select-screen')
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    toast.addDismissable(
                        i18n
                            .get()
                            .t(
                                'messaging.error--picker-time-out',
                                'Screen sharing timed out. Please try again.',
                            ),
                        {
                            type: 'md-icon',
                            name: 'error',
                            theme: 'Outlined',
                            color: 'red',
                        },
                    );
                    return;
                }
                log.debug(`Toggle screen sharing failed`, error);
            });
    }

    function initializeCaptureDevices(initial: {
        readonly microphone: boolean;
        readonly camera: boolean;
    }): void {
        const {lastSelectedCamera, lastSelectedMicrophone} = services.settings.views.calls.get();
        // Serialize with `cameraOperationLock` so a user camera toggle issued during startup queues
        // behind the initial acquisition.
        cameraOperationLock
            .with(async () => {
                await selectInitialCaptureDevices(
                    log,
                    guard,
                    {
                        microphone: {state: initial.microphone ? 'on' : 'off'},
                        camera: {state: initial.camera ? 'on' : 'off'},
                        screen: {state: 'off'},
                    },
                    {
                        preferredDevices: {
                            camera:
                                lastSelectedCamera === undefined
                                    ? {type: 'default'}
                                    : {
                                          type: 'by-device-label',
                                          deviceLabel: lastSelectedCamera,
                                          kind: 'videoinput',
                                      },
                            microphone:
                                lastSelectedMicrophone === undefined
                                    ? {type: 'default'}
                                    : {
                                          type: 'by-device-label',
                                          deviceLabel: lastSelectedMicrophone,
                                          kind: 'audioinput',
                                      },
                        },
                    },
                );
            })
            .catch((error: unknown) => {
                log.error(`Setting initial local capture devices failed`, error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
    }

    function stopCapture(): void {
        disposed = true;

        // Serialize behind any in-flight camera operation to ensure the stop operations are the
        // last ones that run.
        cameraOperationLock
            .with(async () => {
                await guard.with((store) => {
                    const devices = store.get();
                    devices.microphone?.track.stop();
                    devices.camera?.track.stop();
                }, 'stop');
            })
            .catch(assertUnreachable);
    }

    return {
        guard,
        localDevices,
        selectAudioInput,
        selectAudioOutput,
        selectVideo,
        toggleMicrophone,
        toggleCamera,
        toggleScreenSharing,
        updateCameraSubscription,
        updateScreenSubscription,
        initializeCaptureDevices,
        stopCapture,
    };
}

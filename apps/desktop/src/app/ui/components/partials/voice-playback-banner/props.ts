import type {AppServicesForSvelte} from '~/app/types';

/**
 * Props accepted by the `VoicePlaybackBanner` component.
 */
export interface VoicePlaybackBannerProps {
    /**
     * App services. The banner needs the router to determine the currently-viewed conversation
     * (to hide itself inside the owning chat) and to jump back to the playing message.
     */
    readonly services: Pick<AppServicesForSvelte, 'router'>;
}

import type {ScreenSharingSource} from '~/common/electron-ipc';

/**
 * Props accepted by the `ScreenSharingPickerThumbnail` component.
 */
export interface ScreenSharingPickerThumbnailProps {
    readonly source: ScreenSharingSource;
    readonly onselect: (sourceId: string) => void;
}

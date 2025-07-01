import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {ScreenSharingPickerDialogContext} from '~/common/system-dialog';

/**
 * Props accepted by the `ScreenSharingPickerDialog` component.
 */
export interface ScreenSharingPickerDialogProps
    extends Pick<ModalProps, 'onclose' | 'target'>,
        ScreenSharingPickerDialogContext {
    /**
     * Callback to call when a choice is made.
     */
    readonly onselect: (sourceId: string) => void;
    readonly ondismiss: () => void;
}

import type {f64} from '@threema/ts-utils/float/f64';

import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {AutoAppUpdateDownloadDialogContext} from '~/common/system-dialog';

/**
 * Props accepted by the `AutoAppUpdateDownloadDialog` component.
 */
export interface AutoAppUpdateDownloadDialogProps
    extends Pick<ModalProps, 'onclose'>,
        AutoAppUpdateDownloadDialogContext {
    /**
     * Callback which is called when the download dialog is ready (i.e., progress has reached 100%,
     * animations are complete, etc.).
     */
    readonly oncompletion: () => void;
    /**
     * App update download progress.
     */
    readonly progress: f64;
}

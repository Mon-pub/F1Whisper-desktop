import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {LogInfo} from '~/common/node/file-storage/log-info';

/**
 * Props accepted by the `ToggleLoggerModal` component.
 */
export interface ToggleLoggerModalProps extends Pick<ModalProps, 'onclose' | 'onsubmit'> {
    readonly isLoggerEnabled: boolean;
    readonly logInfo: LogInfo;
}

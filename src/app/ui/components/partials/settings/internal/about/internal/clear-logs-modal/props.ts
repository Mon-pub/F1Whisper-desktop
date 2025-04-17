import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {LogInfo} from '~/common/node/file-storage/log-info';

/**
 * Props accepted by the `ClearLogsModal` component.
 */
export interface ClearLogsModalProps extends Pick<ModalProps, 'onclose' | 'onsubmit'> {
    readonly logInfo: LogInfo;
}

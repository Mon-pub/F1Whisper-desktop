import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

export interface CloseModalProps extends Pick<ModalProps, 'onclose'> {
    readonly onclose: () => void;
    readonly onclosepoll: () => void;
}

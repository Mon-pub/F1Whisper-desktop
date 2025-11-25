import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {PublicKey} from '~/common/crypto';

/**
 * Props accepted by the `ThreemaIdInfoInfoModal` component.
 */
export interface ThreemaIdInfoInfoModalProps extends Pick<ModalProps, 'onclose'> {
    readonly publicKey?: PublicKey;
}

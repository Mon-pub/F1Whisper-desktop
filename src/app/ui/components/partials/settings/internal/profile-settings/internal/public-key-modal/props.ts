import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {PublicKey} from '~/common/crypto';

/**
 * Props accepted by the `PublicKeyModal` component.
 */
export interface PublicKeyModalProps extends Pick<ModalProps, 'onclose'> {
    readonly publicKey: PublicKey;
}

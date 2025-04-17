import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {VerificationLevelColors} from '~/app/ui/svelte-components/threema/VerificationDots';

/**
 * Props accepted by the `VerificationLevelInfoModal` component.
 */
export interface VerificationLevelInfoModalProps extends Pick<ModalProps, 'onclose'> {
    readonly colors: VerificationLevelColors;
}

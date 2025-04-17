import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

/**
 * Props accepted by the `ToggleSpellCheckModal` component.
 */
export interface ToggleSpellcheckModalProps extends Pick<ModalProps, 'onclose'> {
    readonly isSpellcheckEnabled: boolean;
    readonly onclickconfirmandrestart?: () => void;
}

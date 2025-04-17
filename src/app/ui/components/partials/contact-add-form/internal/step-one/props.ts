import type {TopBarProps} from '~/app/ui/components/partials/contact-add-form/internal/top-bar/props';

/**
 * Props accepted by the `StepOne` component.
 */
export interface StepOneProps extends Pick<TopBarProps, 'onclickback' | 'onclickcancel'> {
    readonly identity: string;
    readonly identityFieldError: string | undefined;
    readonly oncontinue?: () => void;
}

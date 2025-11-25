import type {StepTwoProps} from '~/app/ui/components/partials/contact-add-form/internal/step-two/props';

export type CurrentStep = StepOne | StepTwo;

interface StepOne {
    readonly step: 'step-one';
}

interface StepTwo {
    readonly step: 'step-two';
    readonly contact: StepTwoProps['contact'];
}

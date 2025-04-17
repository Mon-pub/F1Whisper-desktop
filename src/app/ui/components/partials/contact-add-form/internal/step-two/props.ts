import type {TopBarProps} from '~/app/ui/components/partials/contact-add-form/internal/top-bar/props';
import type {DbContactUid} from '~/common/db';
import type {ContactInit} from '~/common/model';

/**
 * Props accepted by the `StepTwo` component.
 */
export interface StepTwoProps extends Pick<TopBarProps, 'onclickback' | 'onclickcancel'> {
    readonly contact: Contact;
    readonly identity: string;
    readonly oncontinue?: (
        contact: StepTwoProps['contact'],
        firstName: string,
        lastName: string,
    ) => void;
}

type Contact =
    | {
          readonly type: 'new';
          readonly contactInit: ContactInit;
      }
    | {
          readonly type: 'existing';
          readonly uid: DbContactUid;
      };

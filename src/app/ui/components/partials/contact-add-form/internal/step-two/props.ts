import type {DbContactUid} from '~/common/db';
import type {ContactInit} from '~/common/model';

/**
 * Props accepted by the `StepTwo` component.
 */
export interface StepTwoProps {
    readonly contact: Contact;
    readonly identity: string;
    readonly onclickback?: (event: MouseEvent) => void;
    readonly onclickcancel: (event: MouseEvent) => void;
    readonly onformcontinue?: (
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

import type {DbContactUid} from '~/common/db';
import type {ContactInit} from '~/common/model';

/**
 * Props accepted by the `StepTwo` component.
 */
export interface StepTwoProps {
    readonly identity: string;
    readonly contact: Contact;
    readonly handleNextClicked: (
        contact: StepTwoProps['contact'],
        firstName: string,
        lastName: string,
    ) => Promise<void>;
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

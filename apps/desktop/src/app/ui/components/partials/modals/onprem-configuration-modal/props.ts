import type {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';

import type {AppServicesForSvelte} from '~/app/types';
import type {OppfConfig} from '~/app/ui/linking';

export interface OnPremConfigurationModalProps {
    readonly oppfConfig: ResolvablePromise<OppfConfig>;
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}

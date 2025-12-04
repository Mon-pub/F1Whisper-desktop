import type {AppServicesForSvelte} from '~/app/types';
import type {OppfConfig} from '~/app/ui/linking';
import type {ResolvablePromise} from '~/common/utils/resolvable-promise';

export interface OnPremConfigurationModalProps {
    readonly oppfConfig: ResolvablePromise<OppfConfig>;
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}

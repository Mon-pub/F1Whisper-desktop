import type {AppServicesForSvelte} from '~/app/types';

export interface MissingCachedOnPremConfigModalProps {
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}

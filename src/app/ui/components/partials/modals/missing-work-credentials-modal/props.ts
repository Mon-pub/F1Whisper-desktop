import type {AppServicesForSvelte} from '~/app/types';

export interface MissingWorkCredentialsModalProps {
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}

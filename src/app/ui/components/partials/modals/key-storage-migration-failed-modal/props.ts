import type {AppServicesForSvelte} from '~/app/types';

export interface KeyStorageMigrationFailedModalProps {
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}

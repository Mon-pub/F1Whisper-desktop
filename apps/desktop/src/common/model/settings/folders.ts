import {TRANSFER_HANDLER} from '~/common/index';
import type {ServicesForModel} from '~/common/model/types/common';
import type {
    FoldersSettings,
    FoldersSettingsController,
    FoldersSettingsUpdate,
    FoldersSettingsView,
} from '~/common/model/types/settings';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import {ModelStore} from '~/common/model/utils/model-store';
import {PROXY_HANDLER} from '~/common/utils/endpoint';

export class FoldersSettingsModelController implements FoldersSettingsController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    public readonly lifetimeGuard = new ModelLifetimeGuard<FoldersSettingsView>();

    public constructor(private readonly _services: ServicesForModel) {}

    public update(change: FoldersSettingsUpdate): void {
        this.lifetimeGuard.update((view) =>
            this._services.db.setFoldersSettings({
                ...view,
                ...change,
            }),
        );
    }
}

const DEFAULT_FOLDERS_SETTINGS_VIEW: FoldersSettingsView = {folders: [], members: {}};

export class FoldersSettingsModelStore extends ModelStore<FoldersSettings> {
    public constructor(services: ServicesForModel) {
        const {logging} = services;
        const tag = 'settings.folders';
        const foldersSettings = services.db.getFoldersSettings() ?? DEFAULT_FOLDERS_SETTINGS_VIEW;
        super(
            foldersSettings,
            new FoldersSettingsModelController(services),
            undefined,
            undefined,
            {
                debug: {
                    log: logging.logger(`model.${tag}`),
                    tag,
                },
            },
        );
    }
}

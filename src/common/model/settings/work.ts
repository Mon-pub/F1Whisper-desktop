import {TRANSFER_HANDLER} from '~/common/index';
import type {ServicesForModel} from '~/common/model/types/common';
import type {
    WorkSettings,
    WorkSettingsController,
    WorkSettingsUpdate,
    WorkSettingsView,
} from '~/common/model/types/settings';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import {ModelStore} from '~/common/model/utils/model-store';
import {assert} from '~/common/utils/assert';
import {PROXY_HANDLER} from '~/common/utils/endpoint';

const DEFAULT_WORK_SETTINGS: WorkSettingsView = {
    logo: {},
};

export class WorkSettingsModelController implements WorkSettingsController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    public readonly lifetimeGuard = new ModelLifetimeGuard<WorkSettingsView>();

    public constructor(private readonly _services: ServicesForModel) {}

    public update(change: WorkSettingsUpdate): void {
        assert(
            import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom',
            `Build variant must be "work" or "custom"`,
        );

        this.lifetimeGuard.update((view) =>
            this._services.db.setSettings('work', {
                ...view,
                ...change,
            }),
        );
    }
}

export class WorkSettingsModelStore extends ModelStore<WorkSettings> {
    public constructor(services: ServicesForModel) {
        const {logging} = services;
        const tag = 'work-settings';
        super(
            services.db.getSettings('work') ?? DEFAULT_WORK_SETTINGS,
            new WorkSettingsModelController(services),
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

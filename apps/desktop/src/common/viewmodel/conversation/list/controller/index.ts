import {TRANSFER_HANDLER} from '~/common/index';
import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';

export interface IConversationListViewModelController extends ProxyMarked {
    /**
     * Update the user's own work availability status.
     */
    readonly updateWorkAvailabilityStatus: (
        workAvailabilityStatus: WorkAvailabilityStatus,
    ) => Promise<void>;
}

export class ConversationListViewModelController implements IConversationListViewModelController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    public constructor(private readonly _services: ServicesForViewModel) {}

    /** @inheritdoc */
    public async updateWorkAvailabilityStatus(
        workAvailabilityStatus: WorkAvailabilityStatus,
    ): Promise<void> {
        const {user} = this._services.model;

        await user.profileSettings
            .get()
            .controller.setWorkAvailabilityStatus.fromLocal(workAvailabilityStatus);
    }
}

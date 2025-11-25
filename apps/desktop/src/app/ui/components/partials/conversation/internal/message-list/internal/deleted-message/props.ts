import type {AppServicesForSvelte} from '~/app/types';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import type {MessageContextMenuProviderProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-context-menu-provider/props';
import type {MessageSender} from '~/app/ui/components/partials/conversation/internal/message-list/types';
import type {MessageId} from '~/common/network/types';
import type {IQueryableStore} from '~/common/utils/store';
import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `DeletedMessage` component.
 */
export interface DeletedMessageProps {
    readonly boundary?: MessageContextMenuProviderProps['boundary'];
    readonly conversation: {
        readonly receiver: AnyReceiverData;
    };
    /**
     * Whether to play an animation to bring attention to the message. Resets to `false` when the
     * animation is completed.
     */
    readonly highlighted?: MessageProps['highlighted'];
    readonly onclickdeleteoption?: MessageContextMenuProviderProps['onclickdeleteoption'];
    readonly onclickopendetailsoption?: MessageContextMenuProviderProps['onclickopendetailsoption'];
    readonly oncompletehighlightanimation?: MessageProps['oncompletehighlightanimation'];
    readonly services: AppServicesForSvelte;
    readonly store: IQueryableStore<DeletedMessageDetails>;
}

interface DeletedMessageDetails {
    readonly direction: MessageProps['direction'];
    readonly id: MessageId;
    readonly sender: MessageSender;
    readonly status: MessageProps['status'];
}

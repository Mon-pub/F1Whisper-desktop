import type {AppServicesForSvelte} from '~/app/types';
import type {TextAreaProps} from '~/app/ui/components/atoms/textarea/props';
import type {FileResult} from '~/app/ui/svelte-components/utils/filelist';
import type {TextMessageWithByteLength} from '~/common/viewmodel/conversation/main/controller/types';

/**
 * Props accepted by the `ComposeBar` component.
 */
export interface ComposeBarProps
    extends Pick<TextAreaProps, 'enterKeyMode' | 'onistyping' | 'onpaste' | 'onpastefiles'> {
    readonly enterKeyMode: TextAreaProps['enterKeyMode'];
    /**
     * The mode of the compose bar. Defaults to insert.
     */
    readonly mode: 'edit' | 'insert';
    readonly onattachfiles?: (files: FileResult) => void;
    readonly onclickapplyedit?: (text: string) => void;
    readonly onclickcreatepoll?: () => void;
    readonly onclicksend?: (message: TextMessageWithByteLength) => void;
    readonly options?: {
        /** Whether to show a button to attach files. Defaults to `true`. */
        readonly showAddButton?: boolean;
        /** Whether to allow empty messages */
        readonly allowEmptyMessages?: boolean;
    };
    readonly services: Pick<AppServicesForSvelte, 'backend' | 'electron' | 'emojis'>;
    readonly triggerWords?: TextAreaProps['triggerWords'];
}

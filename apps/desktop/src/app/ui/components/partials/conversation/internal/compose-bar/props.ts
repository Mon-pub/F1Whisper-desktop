import type {AppServicesForSvelte} from '~/app/types';
import type {TextAreaProps} from '~/app/ui/components/atoms/textarea/props';
import type {FileResult} from '~/app/ui/svelte-components/utils/filelist';
import type {
    SendFileBasedMessageInformation,
    TextMessageWithByteLength,
} from '~/common/viewmodel/conversation/main/controller/types';

/**
 * Props accepted by the `ComposeBar` component.
 */
export interface ComposeBarProps
    extends Pick<TextAreaProps, 'enterKeyMode' | 'onistyping' | 'onpaste' | 'onpastefiles'> {
    readonly enterKeyMode: TextAreaProps['enterKeyMode'];
    /**
     * The mode of the compose bar. Defaults to insert.
     */
    readonly mode: 'edit' | 'insert' | 'quote' | 'record';
    readonly onattachfiles?: (files: FileResult) => void;
    readonly onbeforeunmount?: () => void;
    readonly onclickapplyedit?: (text: string) => void;
    readonly onclickcreatepoll?: () => void;
    readonly onclicksend?: (message: TextMessageWithByteLength) => void;
    readonly onclickstartrecording: () => void;
    readonly onclickdeleterecording: () => void;
    readonly onclicksendrecording: (file: SendFileBasedMessageInformation) => void;
    readonly options?: {
        /** Whether to show a button to attach files. Defaults to `true`. */
        readonly showAddButton?: boolean;
        /** Whether to allow empty messages */
        readonly allowEmptyMessages?: boolean;
    };
    readonly services: Pick<AppServicesForSvelte, 'backend' | 'electron' | 'emojis'>;
    readonly triggerWords?: TextAreaProps['triggerWords'];
}

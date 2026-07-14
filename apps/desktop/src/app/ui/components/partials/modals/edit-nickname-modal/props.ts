import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

export interface EditNicknameModalProps extends Pick<ModalProps, 'onclose'> {
    /**
     * The current nickname (display name) to pre-fill the input with. May be empty if the user has
     * no nickname set (i.e. the display name currently falls back to the Threema ID).
     */
    readonly currentNickname: string;
    /**
     * Called with the new (trimmed) nickname when the user saves. An empty string clears the
     * nickname.
     */
    readonly onsave: (nickname: string) => void;
}

import type {Readable} from 'svelte/store';

import type {AppServicesForSvelte} from '~/app/types';
import type {u53} from '~/common/types';

/**
 * Props accepted by the `TextArea` component.
 */
export interface TextAreaProps {
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
    /**
     * Whether this field should be autofocused on mount. Defaults to `false`.
     *
     * Note: This should only be set on one input element if you have multiple, as it could lead to
     * unexpected behavior otherwise, because only one element can be focused at a time.
     */
    readonly autofocus?: boolean;
    /** The behavior when pressing the enter key. Defaults to `"submit"`. */
    readonly enterKeyMode: 'submit' | 'newline';
    /** Text to pre-fill when the `TextArea` is first rendered. */
    readonly initialText?: string;
    /** Readable state of whether or not the compose area is currently empty. */
    readonly isEmpty?: Readable<boolean>;
    readonly onheightdidchange?: () => void;
    readonly onheightwillchange?: () => void;
    readonly onistyping?: (isTyping: boolean) => void;
    /**
     * Callback to invoke on paste events.
     *
     * Important: The `TextArea` will not insert the pasted text anymore when this callback is
     * registered. This has to be implemented in the parent component.
     *
     * @param text The pasted plain text.
     */
    readonly onpaste?: (text: string) => void;
    readonly onpastefiles?: (files: File[]) => void;
    readonly onsubmit?: () => void;
    readonly ontextbytelengthdidchange?: (byteLength: u53) => void;
    /** Placeholder text to display when the `TextArea` is empty. */
    readonly placeholder: string;
    /** {@link WordMatcher}s to register in the `TextArea`. */
    readonly triggerWords?: readonly WordMatcher[];
}

/**
 * Defines a special character or word that triggers callbacks when it's typed as the prefix of a
 * word.
 */
interface WordMatcher {
    /**
     * The prefix to match words with.
     */
    readonly prefix: string;
    /**
     * Callback to invoke after each keystroke as long as the word at the current caret position
     * matches `prefix`.
     *
     * @param value The matched word, excluding the prefix.
     */
    readonly onMatch: (value: string) => void;
    /**
     * Callback to invoke after a keystroke when `prefix` switches from matching the word at the
     * current caret position to not matching it. Note: This is only invoked once every time such a
     * switch occurs.
     */
    readonly onMatchEnd: () => void;
}

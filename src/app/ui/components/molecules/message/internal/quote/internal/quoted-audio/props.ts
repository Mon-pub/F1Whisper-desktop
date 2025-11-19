import type {MessageProps} from '~/app/ui/components/molecules/message/props';

export interface QuotedAudioProps {
    readonly file: Exclude<MessageProps['file'], undefined>;
}

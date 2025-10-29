import type {f64} from '~/common/types';
import type {FileBytesAndMediaType} from '~/common/utils/file';

export interface QuotedAudioProps {
    readonly expectedDuration: f64;
    readonly fetchFileBytes: () => Promise<FileBytesAndMediaType | undefined>;
}

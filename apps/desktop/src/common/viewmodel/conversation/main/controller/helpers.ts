import {MessageType} from '~/common/enum';
import type * as protobuf from '~/common/internal-protobuf/settings';
import type {Logger} from '~/common/logging';
import type {MediaBasedMessageType} from '~/common/model/types/message/common';
import type {ReadonlyUint8Array} from '~/common/types';
import {
    isAudioFileType,
    transcodeAudioToMp4Aac,
    transcodeAudioToMp4Opus,
} from '~/common/utils/audio';
import {isSupportedImageType} from '~/common/utils/image';
import {isVideoFileType, transcodeVideoToMp4H264} from '~/common/utils/video';
import type {
    SendFileBasedMessageInformation,
    TranscodeFunction,
    TranscodingResult,
} from '~/common/viewmodel/conversation/main/controller/types';

export function getMessageType(
    basedInformation: SendFileBasedMessageInformation['files'][number],
): MediaBasedMessageType {
    if (!basedInformation.sendAsFile) {
        if (isSupportedImageType(basedInformation.mediaType)) {
            return MessageType.IMAGE;
        } else if (isVideoFileType(basedInformation.mediaType)) {
            return MessageType.VIDEO;
        } else if (isAudioFileType(basedInformation.mediaType)) {
            return MessageType.AUDIO;
        }
    }
    return MessageType.FILE;
}

export async function transcodeVideoAndSetProperties(
    bytes: ReadonlyUint8Array,
    quality: protobuf.MediaSettings_VideoQuality,
    log?: Logger,
): Promise<TranscodingResult | undefined> {
    return await transcodeMediaAndSetProperties<MessageType.VIDEO>(
        transcodeVideoToMp4H264,
        MessageType.VIDEO,
        bytes,
        'video/mp4',
        'mp4',
        quality,
        log,
    );
}

export async function transcodeAudioAndSetProperties(
    bytes: ReadonlyUint8Array,
    log?: Logger,
): Promise<TranscodingResult | undefined> {
    const result = await transcodeMediaAndSetProperties<MessageType.AUDIO>(
        transcodeAudioToMp4Aac,
        MessageType.AUDIO,
        bytes,
        'audio/mp4',
        'm4a',
        undefined,
        log,
    );

    if (result === undefined) {
        log?.debug(
            'Transcoding with "aac" encoder failed (e.g. no AAC encoder on Linux), falling back ' +
                'to an MP4/Opus voice message',
        );

        // Send the Opus fallback as a real voice message (MessageType.AUDIO), NOT a generic file.
        // The MP4 container carries an explicit, correct duration (so player seekbars are right) and
        // Opus-in-MP4 is decodable by Android/iOS. (Previously this returned MessageType.FILE, which
        // demoted the recording to a plain file attachment on Linux.)
        return await transcodeMediaAndSetProperties<MessageType.AUDIO>(
            transcodeAudioToMp4Opus,
            MessageType.AUDIO,
            bytes,
            'audio/mp4',
            'm4a',
            undefined,
            log,
        );
    }

    return result;
}

export async function transcodeMediaAndSetProperties<
    TType extends MessageType.AUDIO | MessageType.FILE | MessageType.VIDEO,
>(
    transcode: TranscodeFunction,
    type: TType,
    bytes: ReadonlyUint8Array,
    mediaType: string,
    fileExtension: string,
    quality: TType extends MessageType.VIDEO ? protobuf.MediaSettings_VideoQuality : undefined,
    log?: Logger,
): Promise<TranscodingResult | undefined> {
    const sendTimestamp = new Date().getTime();
    const transcodingResult = await transcode(bytes, mediaType, log, quality);
    return transcodingResult !== undefined
        ? {
              type,
              bytes: transcodingResult.buffer,
              duration: transcodingResult.duration,
              mediaType,
              fileName: `${import.meta.env.SHORT_APP_NAME.toLowerCase()}-${sendTimestamp}.${fileExtension}`,
              fileSize: transcodingResult.buffer.byteLength,
          }
        : undefined;
}

import {
    Input,
    ALL_FORMATS,
    BlobSource,
    VideoSampleSink,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    Conversion,
} from 'mediabunny';

import type * as protobuf from '~/common/internal-protobuf/settings';
import type {Logger} from '~/common/logging';
import type {ReadonlyUint8Array, u53} from '~/common/types';

/** Whether or not a file is video. */
export function isVideoFileType(type: string): boolean {
    return type.startsWith('video/');
}

/**
 * Generates a thumbnail from a sample of the video at the percentage of the video length specified
 * by `sampleTimestampPercentage`.
 *
 * If `sampleTimestampPercentage` is not a valid percentage, the first frame will be taken.
 *
 * Returns the generated blob in the specified format or undefined, if anything fails. Failures can
 * be evoked by:
 *  - Unsupported video formats or files that are not videos
 *  - Failures instrinsic to the video library
 *  - Failures with regards to the DOM Api and offscreen canvases
 *  - Unsupported thumbnail output parameters
 */
export async function generateVideoThumbnail(
    file: File,
    thumbnailType: `image/${string}`,
    quality: u53,
    sampleTimestampPercentage: u53,
    log?: Logger,
): Promise<Blob | undefined> {
    try {
        const input = new Input({formats: ALL_FORMATS, source: new BlobSource(file)});
        const duration = await input.computeDuration();
        const clampedTimestamp = Math.max(sampleTimestampPercentage, 0);
        const sampleTimestamp = clampedTimestamp > 100 ? 0 : clampedTimestamp;
        const videoTrack = await input.getPrimaryVideoTrack();
        if (videoTrack === null) {
            log?.debug('Cannot generate a thumbnail of a video without video track');
            return undefined;
        }
        const decodable = await videoTrack.canDecode();
        if (!decodable) {
            log?.debug('The browser cannot decode this video');
            return undefined;
        }

        const sink = new VideoSampleSink(videoTrack);
        // If the duration is shorter than the timestamp to be sampled, we just take the first
        // frame.
        const frame = await sink.getSample((duration * sampleTimestamp) / 100);

        if (frame === null) {
            log?.debug('Could not extract a frame for thumbnail generation');
            return undefined;
        }

        const offscreenCanvas = new OffscreenCanvas(frame.codedWidth, frame.codedHeight);
        const ctx = offscreenCanvas.getContext('2d');
        if (ctx === null) {
            log?.debug('Could not get offscreen canvas context');
            return undefined;
        }
        frame.draw(ctx, 0, 0);
        frame.close();
        return await offscreenCanvas.convertToBlob({
            quality,
            type: thumbnailType,
        });
    } catch {
        log?.debug(`Video thumbnail generation of file ${file.name} of type ${file.type} failed`);
        return undefined;
    }
}

/**
 * Transcode a video into an MP4 container with H264 encoding with given quality settings.
 *
 * Returns the transcoded bytes and the length of the video on success, and undefined if transcoding
 * fails.
 *
 * Note: TODO(DESK-1998): The quality setting is currently ignored.
 */
export async function transcodeVideoToMp4H264(
    bytes: ReadonlyUint8Array,
    mediaType: string,
    quality: protobuf.MediaSettings_VideoQuality,
    log?: Logger,
): Promise<{readonly buffer: ReadonlyUint8Array; readonly duration: u53} | undefined> {
    try {
        const input = new Input({
            formats: ALL_FORMATS,
            source: new BlobSource(new Blob([bytes], {type: mediaType})),
        });

        const output = new Output({format: new Mp4OutputFormat(), target: new BufferTarget()});

        // TODO(DESK-1998): Revert the commit that added this comment.
        // const bitrate = mapQualityToMediaBunny(quality);

        const conversionResult = await Conversion.init({
            input,
            output,
            video: {
                codec: 'avc',
                // TODO(DESK-1998): Revert the commit that added this comment.
                //
                // If we add the bitrate here, OpenH264 invoked by electron will complain. Before
                // we use the setting, we should therefore investigate why this is the case.
                //
                // bitrate,
            },
            audio: {
                codec: 'aac',
                // TODO(DESK-1998): Revert the commit that added this comment.
                // bitrate,
            },
        });
        await conversionResult.execute();
        const duration = await input.computeDuration();
        const blob = output.target.buffer;
        if (blob === null) {
            log?.debug('Video transcoding output buffer does not contain a result');
            return undefined;
        }

        return {buffer: new Uint8Array(blob), duration};
    } catch (error) {
        log?.debug('Video transcoding failed with error: ', error);
        return undefined;
    }
}

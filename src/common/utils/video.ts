import {
    Input,
    ALL_FORMATS,
    BlobSource,
    VideoSampleSink,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    Conversion,
    type InputVideoTrack,
    type InputAudioTrack,
} from 'mediabunny';

import type * as protobuf from '~/common/internal-protobuf/settings';
import type {Logger} from '~/common/logging';
import type {ReadonlyUint8Array, u53} from '~/common/types';

/** Whether or not a file is video. */
export function isVideoFileType(type: string): boolean {
    return type.startsWith('video/');
}

async function createMp4ConversionInit(
    bytes: ReadonlyUint8Array,
    inputMediaType: string,
): Promise<{
    readonly conversion: Conversion;
    readonly input: Input<BlobSource>;
    readonly output: Output<Mp4OutputFormat, BufferTarget>;
}> {
    const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(new Blob([bytes], {type: inputMediaType})),
    });
    const output = new Output({format: new Mp4OutputFormat(), target: new BufferTarget()});

    // TODO(DESK-1998): Revert the commit that added this comment.
    // const bitrate = mapQualityToMediaBunny(quality);

    return {
        conversion: await Conversion.init({
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
        }),
        input,
        output,
    };
}

async function validateConvertibility(
    bytes: ReadonlyUint8Array,
    inputMediaType: string,
): Promise<
    | {
          readonly ok: true;
          readonly primaryAudioTrack: InputAudioTrack | undefined;
          readonly primaryVideoTrack: InputVideoTrack;
      }
    | {ok: false; reason: string}
> {
    const {conversion, input} = await createMp4ConversionInit(bytes, inputMediaType);

    const primaryVideoTrack = await input.getPrimaryVideoTrack();
    if (primaryVideoTrack === null) {
        return {
            ok: false,
            reason: 'Video track is null',
        };
    }

    const decodable = await primaryVideoTrack.canDecode();
    if (!decodable) {
        return {
            ok: false,
            reason: 'Video is not decodable',
        };
    }

    const primaryAudioTrack = await input.getPrimaryAudioTrack();
    if (primaryAudioTrack !== null && !(await primaryAudioTrack.canDecode())) {
        return {
            ok: false,
            reason: 'Primary audio track of the video is not decodable',
        };
    }

    // If any tracks would be discarded, we have to assume that the conversion
    // will be incomplete, which means the transcoding should fail.
    if (conversion.discardedTracks.length > 0) {
        return {
            ok: false,
            reason: 'Some tracks were discarded, which means the conversion type is not supported on this platform',
        };
    }

    return {
        ok: true,
        primaryAudioTrack: primaryAudioTrack ?? undefined,
        primaryVideoTrack,
    };
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

        const bytes: ReadonlyUint8Array = new Uint8Array(await file.arrayBuffer());
        const result = await validateConvertibility(bytes, file.type);
        if (!result.ok) {
            throw new Error(result.reason);
        }

        const sink = new VideoSampleSink(result.primaryVideoTrack);
        // If the duration is shorter than the timestamp to be sampled, we just take the first
        // frame.
        const frame = await sink.getSample((duration * sampleTimestamp) / 100);

        if (frame === null) {
            throw new Error('Could not extract a frame for thumbnail generation');
        }

        const offscreenCanvas = new OffscreenCanvas(frame.codedWidth, frame.codedHeight);
        const ctx = offscreenCanvas.getContext('2d');
        if (ctx === null) {
            throw new Error('Could not get offscreen canvas context');
        }
        frame.draw(ctx, 0, 0);
        frame.close();

        return await offscreenCanvas.convertToBlob({
            quality,
            type: thumbnailType,
        });
    } catch (error) {
        log?.debug(
            `Video thumbnail generation of file ${file.name} of type ${file.type} failed:`,
            error,
        );
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
    log?: Logger,
    quality?: protobuf.MediaSettings_VideoQuality,
): Promise<{readonly buffer: ReadonlyUint8Array; readonly duration: u53} | undefined> {
    try {
        const {conversion, input, output} = await createMp4ConversionInit(bytes, mediaType);
        // If any tracks were discarded, we have to assume that the conversion will be incomplete,
        // which means the transcoding should fail.
        if (conversion.discardedTracks.length > 0) {
            throw new Error(
                'Some tracks were discarded, which means some format(s) used in this video file are not supported on this platform',
            );
        }

        await conversion.execute();
        const duration = await input.computeDuration();
        const blob = output.target.buffer;
        if (blob === null) {
            throw new Error('Video transcoding output buffer does not contain a result');
        }

        return {buffer: new Uint8Array(blob), duration};
    } catch (error) {
        log?.debug('Video transcoding failed with error:', error);
        return undefined;
    }
}

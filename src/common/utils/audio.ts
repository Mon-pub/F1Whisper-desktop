import {
    Input,
    ALL_FORMATS,
    BlobSource,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    Conversion,
} from 'mediabunny';

import type {Logger} from '~/common/logging';
import type {f64, u53, ReadonlyUint8Array} from '~/common/types';

export interface TranscodingResult {
    buffer: ReadonlyUint8Array;
    duration: number;
}

/** Whether or not a file is audio. */
export function isAudioFileType(type: string): boolean {
    return type.startsWith('audio/');
}

/**
 * Calculate the root mean square of the signal strength of `numSamples` evenly spread samples in
 * the main audio track of the provided audio blob.
 *
 * Returns undefined if `AudioBlob` is not of supported format or if sampling fails.
 */
export async function calculateRootMeanSquare(
    audioBlob: Blob,
    numSamples: u53,
    log?: Logger,
): Promise<readonly f64[] | undefined> {
    try {
        if (numSamples === 0) {
            log?.warn('Cannot extract 0 samples from audio');
            return undefined;
        }

        const audioContext = new AudioContext();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // For simplicity, we just take the main channel.
        const channelData = audioBuffer.getChannelData(0);
        const totalLength = channelData.byteLength / 4;
        const chunkSize = Math.floor(totalLength / numSamples);

        const rms: f64[] = [];

        for (let i = 0; i < totalLength; i += chunkSize) {
            const slice = channelData.subarray(i, i + chunkSize);
            const sumSq = slice.reduce((sum, val) => sum + val * val, 0);
            rms.push(Math.sqrt(sumSq / slice.byteLength));
        }
        return rms;
    } catch (error) {
        log?.debug('Could not calculate the RMS of given audio file: ', error);
        return undefined;
    }
}

/**
 * Compute the audio duration of a given blob.
 *
 * Returns undefined if the duration could not be computed or if the blob is not of supported audio format.
 */
export async function computeAudioDuration(
    audioBlob: Blob,
    log?: Logger,
): Promise<f64 | undefined> {
    try {
        const audioContext = new AudioContext();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer.duration;
    } catch (error) {
        log?.debug('Could not compute audio duration: ', error);
        return undefined;
    }
}

/**
 * Convert audio into a MP4 container using AAC encoding.
 *
 * Returns undefined if the transcoding failed.
 */
export async function transcodeAudioToMp4Aac(
    bytes: ReadonlyUint8Array,
    mediaType: string,
    log?: Logger,
): Promise<TranscodingResult | undefined> {
    try {
        const input = new Input({
            formats: ALL_FORMATS,
            source: new BlobSource(new Blob([bytes], {type: mediaType})),
        });

        const output = new Output({format: new Mp4OutputFormat(), target: new BufferTarget()});

        const conversionResult = await Conversion.init({
            input,
            output,
            audio: {
                codec: 'aac',
            },
        });
        await conversionResult.execute();
        const duration = await input.computeDuration();
        const blob = output.target.buffer;
        if (blob === null) {
            log?.debug('Audio transcoding output buffer does not contain a result');
            return undefined;
        }

        return {buffer: new Uint8Array(blob), duration};
    } catch (error) {
        log?.debug('Audio transcoding failed with error: ', error);
        return undefined;
    }
}

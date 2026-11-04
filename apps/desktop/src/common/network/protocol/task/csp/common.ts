import {bytesToHex} from '@threema/ts-utils/byte/bytes-to-hex';
import type {u53} from '@threema/ts-utils/integer/u53';
import {u64ToHexLe} from '@threema/ts-utils/number/u64-to-hex-le';

import {PollDisplayMode, PollState} from '~/common/enum';
import type {OutboundAudioMessageBundle} from '~/common/model/types/message/audio';
import type {OutboundFileMessageBundle} from '~/common/model/types/message/file';
import type {OutboundImageMessageBundle} from '~/common/model/types/message/image';
import type {OutboundPollMessageBundle} from '~/common/model/types/message/poll';
import type {OutboundVideoMessageBundle} from '~/common/model/types/message/video';
import type {IdentityString} from '~/common/network/types';
import {unreachable, unwrap} from '~/common/utils/assert';
import {filterUndefinedProperties} from '~/common/utils/object';

/**
 * Based on the specified message, generate the file message JSON data (as defined in the CSP file
 * message specification).
 */
export function getFileJsonData<
    TMessageModel extends
        | Pick<OutboundFileMessageBundle['model'], 'type' | 'view'>
        | Pick<OutboundImageMessageBundle['model'], 'type' | 'view'>
        | Pick<OutboundVideoMessageBundle['model'], 'type' | 'view'>
        | Pick<OutboundAudioMessageBundle['model'], 'type' | 'view'>,
>(message: TMessageModel): Record<string, unknown> {
    const {type, view} = message;

    // Extract blob IDs
    const blobId = unwrap(view.blobId, 'Tried to send file based message without blob ID');
    const thumbnailBlobId = view.thumbnailBlobId;

    // Extract rendering type and metadata based on file type
    let renderingType: u53;
    let deprecatedRenderingType: u53;
    let metadata;
    switch (type) {
        case 'file':
            renderingType = deprecatedRenderingType = 0; // File
            // F1Whisper fork: quote-any-type. Only emit the `x` metadata bag at all when there's a
            // quote to carry, so a plain file message's wire shape is unchanged (matches the
            // pre-existing behaviour of omitting `x` entirely for this type).
            metadata =
                view.quotedMessageId === undefined
                    ? undefined
                    : filterUndefinedProperties({qi: u64ToHexLe(view.quotedMessageId)});
            break;
        case 'image':
            renderingType = view.renderingType; // Image or sticker
            deprecatedRenderingType = 1;
            metadata = filterUndefinedProperties({
                a: view.animated,
                h: view.dimensions?.height,
                w: view.dimensions?.width,
                // Spoiler / forwarded / link-preview / quote metadata (F1Whisper fork). The
                // snake_case `lp_*` keys are the exact protocol wire keys and round-trip with the
                // decode side (`RAW_IMAGE_METADATA_SCHEMA`) and with the Android app.
                sp: view.spoiler,
                fwd: view.forwarded,
                /* eslint-disable @typescript-eslint/naming-convention */
                lp_u: view.linkPreviewUrl,
                lp_t: view.linkPreviewTitle,
                lp_d: view.linkPreviewDescription,
                qi:
                    view.quotedMessageId === undefined
                        ? undefined
                        : u64ToHexLe(view.quotedMessageId),
                /* eslint-enable @typescript-eslint/naming-convention */
            });
            break;
        case 'video':
            renderingType = deprecatedRenderingType = 1; // Media
            metadata = filterUndefinedProperties({
                d: view.duration,
                h: view.dimensions?.height,
                w: view.dimensions?.width,
                // Spoiler / quote metadata (F1Whisper fork). `sp` mirrors the image branch (send
                // side of the already-working `RAW_VIDEO_METADATA_SCHEMA` decode); `forwarded` is
                // NOT settable on video yet (no send-side entry point exists for it either).
                sp: view.spoiler,
                fwd: view.forwarded,
                qi:
                    view.quotedMessageId === undefined
                        ? undefined
                        : u64ToHexLe(view.quotedMessageId),
            });
            break;
        case 'audio':
            renderingType = deprecatedRenderingType = 1; // Media
            metadata = filterUndefinedProperties({
                d: view.duration,
                // F1Whisper fork: listen-once. Emit ONLY `lo` on the wire; NEVER `loc` (the
                // consumed flag is local-only — Android v6.4.3-23 fix).
                lo: view.listenOnce === true ? true : undefined,
                // F1Whisper fork: quote-any-type.
                qi:
                    view.quotedMessageId === undefined
                        ? undefined
                        : u64ToHexLe(view.quotedMessageId),
            });
            break;
        default:
            unreachable(message);
    }

    return filterUndefinedProperties({
        j: renderingType, // Rendering type
        i: deprecatedRenderingType, // Deprecated rendering type for compatibility
        k: bytesToHex(view.encryptionKey.unwrap()), // Blob encryption key
        b: bytesToHex(blobId), // File blob ID
        m: view.mediaType, // File media type
        n: view.fileName, // File name
        s: view.fileSize, // File size in bytes
        t: thumbnailBlobId === undefined ? undefined : bytesToHex(thumbnailBlobId), // Blob containing the thumbnail file data
        p: view.thumbnailMediaType, // Media type of the thumbnail
        d: view.caption, // Caption text
        c: view.correlationId, // Correlation ID
        x: metadata, // Metadata
    });
}

export function getPollJsonData(
    poll: OutboundPollMessageBundle['view'],
    participants: readonly IdentityString[],
    participantVotes: readonly u53[][],
): Record<string, unknown> {
    const jsonChoices = poll.choices.map((choice, index) => ({
        i: choice.choiceId,
        n: choice.description,
        o: choice.sortKey,
        r:
            // eslint-disable-next-line no-nested-ternary
            poll.pollState !== PollState.CLOSED
                ? undefined
                : poll.displayMode === PollDisplayMode.SUMMARY
                  ? []
                  : participantVotes[index],
        t: poll.pollState === PollState.CLOSED ? choice.totalAmountVotes : undefined,
    }));
    return {
        t: poll.announceType,
        d: poll.description,
        s: poll.pollState,
        a: poll.answerType,
        u: poll.displayMode,
        o: 0,
        p:
            // eslint-disable-next-line no-nested-ternary
            poll.pollState !== PollState.CLOSED
                ? undefined
                : poll.displayMode === PollDisplayMode.SUMMARY
                  ? []
                  : participants,
        c: jsonChoices,
    };
}

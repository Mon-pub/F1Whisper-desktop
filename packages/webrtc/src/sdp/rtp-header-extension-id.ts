import type {u8} from '@threema/ts-utils/integer/u8';
import type {WeakOpaque} from '@threema/ts-utils/meta/newtype';

/** An RTP one-byte header extension ID (4-bit, 1-14 inclusive). */
export type RtpHeaderExtensionId = WeakOpaque<u8, {readonly RtpHeaderExtensionId: unique symbol}>;

export function isRtpHeaderExtensionId(value: number): value is RtpHeaderExtensionId {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 14;
}

export function ensureRtpHeaderExtensionId(value: number): RtpHeaderExtensionId {
    if (!isRtpHeaderExtensionId(value)) {
        throw Error('Not a valid RTP header extension ID');
    }
    return value;
}

export type RtpHeaderExtensionIds = Record<
    | 'mid'
    | 'rtpStreamId'
    | 'repairedRtpStreamId'
    | 'absoluteSendTime'
    | 'transportWideCongestionControl_01'
    | 'videoOrientation'
    | 'timeOffset',
    RtpHeaderExtensionId
>;

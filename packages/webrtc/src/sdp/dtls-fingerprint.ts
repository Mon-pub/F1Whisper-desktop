import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
import type {WeakOpaque} from '@threema/ts-utils/meta/newtype';

/** We're exclusively using SHA-256 for DTLS fingerprints. */
export type DtlsFingerprint = WeakOpaque<
    ReadonlyUint8Array,
    {readonly DtlsFingerprint: unique symbol}
>;

export function isDtlsFingerprint(array: ReadonlyUint8Array): array is DtlsFingerprint {
    return array.byteLength === 32 && !array.every((byte) => byte === 0);
}

export function ensureDtlsFingerprint(array: Uint8Array): DtlsFingerprint {
    if (!isDtlsFingerprint(array)) {
        throw Error('Not a valid DTLS fingerprint');
    }
    return array;
}

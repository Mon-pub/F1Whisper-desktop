import {ensureU53, type u53} from '~/common/types';
import {assert} from '~/common/utils/assert';

/** Maximum sender-advertised per-message timer accepted from encrypted metadata: 365 days. */
export const F1_DISAPPEARING_TIMER_MAX_SECONDS: u53 = 365 * 24 * 60 * 60;

// Field 100 costs two tag bytes plus up to five uint32 varint bytes. The spare byte keeps the
// compensating padding non-empty, avoiding protobuf's zero-length bytes-field discontinuity.
const F1_TIMER_MAX_WIRE_LENGTH = 7;
const F1_TIMER_PADDING_BUDGET = F1_TIMER_MAX_WIRE_LENGTH + 1;
const F1_MAX_COMPENSABLE_BASE_PADDING = 127 - F1_TIMER_PADDING_BUDGET;

export function clampF1DisappearingTimer(timerSeconds: u53): u53 {
    return ensureU53(Math.min(timerSeconds, F1_DISAPPEARING_TIMER_MAX_SECONDS));
}

/** Keep serialized metadata length independent of field-100 presence and varint width. */
export function getF1CompensatedMetadataPaddingLength(
    basePaddingLength: u53,
    encodedF1MetadataLength: u53,
): u53 {
    assert(
        basePaddingLength <= F1_MAX_COMPENSABLE_BASE_PADDING,
        'Base metadata padding is too large for field-100 length compensation',
    );
    assert(
        encodedF1MetadataLength <= F1_TIMER_MAX_WIRE_LENGTH,
        'Field-100 metadata exceeds its maximum uint32 wire length',
    );
    return ensureU53(basePaddingLength + F1_TIMER_PADDING_BUDGET - encodedF1MetadataLength);
}

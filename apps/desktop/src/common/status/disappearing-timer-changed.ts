import type {StatusMessageType} from '~/common/enum';
import type {StatusMessageValues} from '~/common/model/types/status';
import {ensureIdentityString} from '~/common/network/types';
import type {StatusMessagesCodec} from '~/common/status';
import {ensureU53} from '~/common/types';
import {UTF8} from '~/common/utils/codec';

/**
 * Codec for the F1Whisper disappearing-timer-changed status message.
 *
 * This is a fork-local status row (never sent over the wire), so it does not need a protocol
 * protobuf. It is encoded as a small UTF-8 JSON object to avoid touching the generated
 * `internal-protobuf/status-message` definitions.
 */
export const DISAPPEARING_TIMER_CHANGED_CODEC: StatusMessagesCodec<StatusMessageType.DISAPPEARING_TIMER_CHANGED> =
    {
        encode: (status) =>
            UTF8.encode(
                JSON.stringify({
                    changedBy: status.changedBy,
                    newTimerSeconds: status.newTimerSeconds,
                }),
            ),
        decode: (encoded) => {
            const raw: unknown = JSON.parse(UTF8.decode(encoded as Uint8Array));
            if (typeof raw !== 'object' || raw === null) {
                throw new Error('Invalid disappearing-timer-changed status payload');
            }
            const {changedBy, newTimerSeconds} = raw as Record<string, unknown>;
            return {
                changedBy: changedBy === 'me' ? 'me' : ensureIdentityString(changedBy as string),
                newTimerSeconds: ensureU53(newTimerSeconds),
            } satisfies StatusMessageValues[StatusMessageType.DISAPPEARING_TIMER_CHANGED];
        },
    } as const;

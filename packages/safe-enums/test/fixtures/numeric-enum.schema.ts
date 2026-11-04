// @ts-nocheck
import type {Logger} from '~/common/logging';
import type {u53} from '~/common/types';
import type {MonotonicEnumStore, StoreDebug} from '~/common/utils/store';

/**
 * A numeric enum requesting all available utilities.
 *
 * @generate convert name store
 */
export const enum ConnectionState {
    /** Not connected. */
    DISCONNECTED = 0,
    /** Connection is being established. */
    CONNECTING = 1,
    // Connection has been established.
    //
    // Note: This is a line comment rather than a JSDoc block, so that both comment kinds are
    // exercised.
    CONNECTED = 0x10,
}

/**
 * A numeric enum requesting the name lookup only, i.e. no conversion helpers.
 *
 * @generate name
 */
export const enum ActivityState {
    ACTIVE = 0,
    INACTIVE = 1,
}

/**
 * A numeric enum requesting a store only, which implies the name lookup the store reads from.
 *
 * @generate store
 */
export const enum SyncState {
    IDLE = 0,
    SYNCING = 1,
}

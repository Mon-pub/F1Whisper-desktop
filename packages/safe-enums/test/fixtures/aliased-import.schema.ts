// @ts-nocheck
import type {Logger as Log} from '~/common/logging';
import type {u53} from '~/common/types';
import type {MonotonicEnumStore, StoreDebug} from '~/common/utils/store';

/**
 * A numeric enum requesting a store, in a schema that binds the `Logger` the generated code refers
 * to under a different name, which is rejected.
 *
 * @generate store
 */
export const enum ConnectionState {
    DISCONNECTED = 0,
    CONNECTED = 1,
}

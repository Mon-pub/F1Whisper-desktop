// @ts-check

/**
 * Common utilities used by multiple tools scripts.
 */
import * as v from '@badrap/valita';

export const BUILD_ENVIRONMENT_SCHEMA = v.union(
    v.literal('live'),
    v.literal('onprem'),
    v.literal('sandbox'),
);
export const BUILD_MODE_SCHEMA = v.union(v.literal('production'), v.literal('testing'));
export const BUILD_TARGET_SCHEMA = v.union(v.literal('cli'), v.literal('electron'));
export const BUILD_VARIANT_SCHEMA = v.union(
    v.literal('consumer'),
    v.literal('custom'),
    v.literal('work'),
);
